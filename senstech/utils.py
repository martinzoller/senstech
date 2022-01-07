# -*- coding: utf-8 -*-
#
# utils.py
#
# Copyright (C) libracore, 2017-2020
# https://www.libracore.com or https://github.com/libracore
#
# For information on ERPNext, refer to https://erpnext.org/
#

import frappe
import json
import urllib.parse
import six
import pdfkit, os, io
from frappe import _, attach_print
from frappe.utils.data import today, add_days
from frappe.contacts.doctype.address.address import get_address_display
import csv
from PyPDF2 import PdfFileWriter, PdfFileReader
from frappe.utils.print_format import read_multi_pdf
import socket

@frappe.whitelist()
def check_batch_release(delivery_note=None):
    data = {}
    data['status'] = 'ok'
    data['items'] = []
	
    if delivery_note:
        items = frappe.db.sql("""SELECT `item_name`, `item_code`, `customer_item_code`, `batch_no` FROM `tabDelivery Note Item` WHERE `parent` = '{delivery_note}'""".format(delivery_note=delivery_note), as_dict=True)
        for item in items:
            if item.batch_no:
                item_master = frappe.get_doc("Item", item.item_code)
                if item_master.benoetigt_chargenfreigabe:
                    batch = frappe.get_doc("Batch", item.batch_no)
                    if not batch.freigabedatum:
                        data['status'] = 'nok'
                        data['items'].append(item)
    return data

@frappe.whitelist()
def get_help_links():
    sql_query = """SELECT * FROM `tabEinstellungen Dokumentation DocTypes`"""
    links = frappe.db.sql(sql_query, as_dict=True)
    if links:
        return links
    else:
        return False

@frappe.whitelist()
def transfer_item_drawings(po, items):
    if isinstance(items, six.string_types):
        items = json.loads(items)
    counter = 0
    for _item in items:
        item = frappe.get_doc("Item", _item)
        if item.zeichnung:
            file_url = item.zeichnung
            filename = get_file_name(file_url)
            dt = 'Purchase Order'
            dn = po
            if len(check_if_attachment_exist(file_url, dn)) < 1:
                f = frappe.get_doc({
                    "doctype": "File",
                    "file_url": file_url,
                    "file_name": filename,
                    "attached_to_doctype": dt,
                    "attached_to_name": dn,
                    "folder": 'Home/Attachments',
                    "file_size": 0,
                    "is_private": 0
                })
                f.flags.ignore_permissions = True
                try:
                    f.insert()
                    frappe.db.commit()
                    counter += 1
                except:
                    pass
    return counter

def get_file_name(file_url):
    return frappe.db.sql("""SELECT `file_name` FROM `tabFile` WHERE `file_url` = '{file_url}' LIMIT 1""".format(file_url=file_url), as_list=True)[0][0]

def check_if_attachment_exist(file_url, dn):
    return frappe.db.sql("""SELECT `name` FROM `tabFile` WHERE `file_url` = '{file_url}' AND `attached_to_name` = '{dn}'""".format(file_url=file_url, dn=dn), as_list=True)

@frappe.whitelist()
def get_next_purchase_item_number():
    latest_pt_number = frappe.db.sql("""SELECT `name` FROM `tabItem` WHERE `is_purchase_item` = 1 AND `name` LIKE 'PT-%' ORDER BY `creation` DESC""", as_list=True)
    raw_pt_number = latest_pt_number[0][0]
    pt_number = int(raw_pt_number.replace("PT-", ''))
    new_pt_number = pt_number + 1
    new_pt_number = "PT-"+("0000{pt}".format(pt=new_pt_number))[-5:]
    return new_pt_number

@frappe.whitelist()
def entnahme_blech(item):
    item = frappe.get_doc("Item", item)
    if item.stock_uom == 'Stk':
        return {
            'qty': 1.000,
            'conversion_factor': 1,
            'stock_uom': item.stock_uom
        }
    else:
        for uom in item.uoms:
            if uom.uom == 'Stk':
                return {
                    'qty': 1 * uom.conversion_factor,
                    'conversion_factor': uom.conversion_factor,
                    'stock_uom': item.stock_uom
                }
        return {'error': _('No Conversion Factor to UOM Stk')}

@frappe.whitelist()
def check_for_batch_quick_stock_entry(batch_no, warehouse, item):
    benoetigt_chargenfreigabe = float(frappe.get_doc("Item", item).benoetigt_chargenfreigabe)
    if batch_no and warehouse:
        entry_qty = float(frappe.db.sql("""SELECT SUM(`actual_qty`)
            FROM `tabStock Ledger Entry`
            WHERE `warehouse` = '{warehouse}' AND `batch_no` = '{batch_no}' AND `actual_qty` > 0""".format(warehouse=warehouse, batch_no=batch_no), as_list=True)[0][0] or 0)
        return {
            'entry_qty': entry_qty,
            'benoetigt_chargenfreigabe': benoetigt_chargenfreigabe
        }

@frappe.whitelist()
def batch_quick_stock_entry(batch_no, warehouse, item, qty):
    stock_entry = frappe.get_doc({
        'doctype': 'Stock Entry',
        'stock_entry_type': "Material Receipt",
        'to_warehouse': warehouse,
        'items': [{
            'item_code': item,
            'qty': qty,
            'batch_no': batch_no
        }]
    }).insert()
    stock_entry.submit()

    return stock_entry.name

@frappe.whitelist()
def nachbestellung(item, supplier, qty, taxes):
    lieferzeit = frappe.get_doc("Item", item).lead_time_days or 0
    schedule_date = add_days(today(), lieferzeit)
    
    purchase_order = frappe.get_doc({
        'doctype': 'Purchase Order',
        'supplier': supplier,
        'schedule_date': schedule_date,
        'taxes_and_charges': taxes,
        'items': [{
            'item_code': item,
            'qty': qty,
            'schedule_date': schedule_date
        }]
    }).insert()

    return purchase_order.name
    
@frappe.whitelist()
def update_adress_display(doctype, doc_name, fields, addresses, as_list=False):
    if as_list:
        if isinstance(fields, six.string_types):
            fields = json.loads(fields)
        if isinstance(addresses, six.string_types):
            addresses = json.loads(addresses)
        count = 0
        response = []
        for field in fields:
            address = addresses[count]
            address_html = get_address_display(address)
            old_display = frappe.db.sql("""SELECT `{field}` FROM `tab{doctype}` WHERE `name` = '{doc_name}'""".format(field=field, doctype=doctype, doc_name=doc_name), as_dict=True)
            count += 1
            if len(old_display) >= 1:
                if old_display[0][field] != address_html:
                    frappe.db.sql("""UPDATE `tab{doctype}` SET `{field}` = '{address_html}' WHERE `name` = '{doc_name}'""".format(field=field, doctype=doctype, doc_name=doc_name, address_html=address_html), as_list=True)
                    frappe.db.commit()
                    response.append('updated')
                else:
                    response.append('passed')
            else:
                response.append('no address')
        return response
    else:
        field = fields
        address = addresses
        address_html = get_address_display(address)
        old_display = frappe.db.sql("""SELECT `{field}` FROM `tab{doctype}` WHERE `name` = '{doc_name}'""".format(field=field, doctype=doctype, doc_name=doc_name), as_dict=True)
        if len(old_display) >= 1:
            if old_display[0][field] != address_html:
                frappe.db.sql("""UPDATE `tab{doctype}` SET `{field}` = '{address_html}' WHERE `name` = '{doc_name}'""".format(field=field, doctype=doctype, doc_name=doc_name, address_html=address_html), as_list=True)
                frappe.db.commit()
                return 'updated'
            else:
                return 'passed'
        else:
            return 'no address'
            
@frappe.whitelist()
def calculate_versanddatum(so):
    sales_order = frappe.get_doc("Sales Order", so)
    vorlauf = frappe.get_doc("Customer", sales_order.customer).vorlaufzeit_versand
    if vorlauf and vorlauf > 0:
        try:
            new_date = add_days(sales_order.delivery_date, vorlauf * -1)
            frappe.db.sql("""UPDATE `tabSales Order` SET `versanddatum` = '{new_date}' WHERE `name` = '{so}'""".format(new_date=new_date, so=so), as_list=True)
            frappe.db.commit()
            return 'updated'
        except:
            return 'passed'
    else:
        try:
            new_date = sales_order.delivery_date
            frappe.db.sql("""UPDATE `tabSales Order` SET `versanddatum` = '{new_date}' WHERE `name` = '{so}'""".format(new_date=new_date, so=so), as_list=True)
            frappe.db.commit()
            return 'updated'
        except:
            return 'passed'
            
@frappe.whitelist()
def create_payment(sinv):
    try:
        sinv = frappe.get_doc("Sales Invoice", sinv)
        pe = frappe.get_doc({
            "doctype": "Payment Entry",
            'posting_date': today(),
            "payment_type": "Receive",
            "party_type": "Customer",
            "party": sinv.customer,
            "paid_from": '1100 - Forderungen Schweiz - ST',
            'paid_to': '1020 - KK ZKB 1042-0171.171 - ST',
            'paid_amount': sinv.outstanding_amount,
            'received_amount': sinv.outstanding_amount,
            "references": [
                {
                    "reference_doctype": "Sales Invoice",
                    'reference_name': sinv.name,
                    'allocated_amount': sinv.outstanding_amount
                }
            ],
            "reference_no": sinv.name,
            'reference_date': today(),
            'remarks': 'Auto Payment for {sinv}'.format(sinv=sinv.name)
        })
        pe.insert()
        pe.submit()
        return pe.name
    except Exception as err:
        return err

@frappe.whitelist()
def get_histogramm_data(item, batch, messdaten_nullpunkt=None, messdaten_last=None):
    histogramm_data = []
    max_anzahl = 0
    item = frappe.get_doc("Item", item)
    for _histogramm in item.histogramme:
        histogramm = frappe.get_doc("Senstech Histogramm", _histogramm.histogramm)
        _histogramm_data = {
            'title': histogramm.histogramm_titel,
            'x_title': histogramm.x_beschriftung,
            'y_title': histogramm.y_beschriftung,
            'bins': [],
            'bin_range': [],
            'values': [],
            'qty': 0
        }
        data_row = histogramm.daten_spalte
        for bin in histogramm.klassen:
            _histogramm_data['bin_range'].append([bin.range_von, bin.range_bis])
            _histogramm_data['values'].append(0)
            _histogramm_data['bins'].append(bin.bezeichnung)

        if messdaten_nullpunkt:
            with open(frappe.get_site_path(messdaten_nullpunkt.strip('/')), 'r') as f:
                reader = csv.reader(f, dialect='excel', delimiter='\t')
                first_row = True
                data_row_found = False
                data_row_int = 0
                for row in reader:
                    if first_row:
                        for num, _data_row in enumerate(row):
                            if _data_row == data_row:
                                data_row_found = True
                                first_row = False
                                data_row_int = num
                    else:
                        if data_row_found:
                            for num, bin_range in enumerate(_histogramm_data['bin_range']):
                                    if float(row[data_row_int]) >= float(bin_range[0]):
                                        if float(row[data_row_int]) < float(bin_range[1]):
                                            _histogramm_data['values'][num] += 1
                                            _histogramm_data['qty'] += 1
                                            pass
        if messdaten_last:
            with open(frappe.get_site_path(messdaten_last.strip('/')), 'r') as f:
                reader = csv.reader(f, dialect='excel', delimiter='\t')
                first_row = True
                data_row_found = False
                data_row_int = 0
                for row in reader:
                    if first_row:
                        for num, _data_row in enumerate(row):
                            if _data_row == data_row:
                                data_row_found = True
                                first_row = False
                                data_row_int = num
                    else:
                        if data_row_found:
                            for num, bin_range in enumerate(_histogramm_data['bin_range']):
                                    if float(row[data_row_int]) >= float(bin_range[0]):
                                        if float(row[data_row_int]) < float(bin_range[1]):
                                            _histogramm_data['values'][num] += 1
                                            _histogramm_data['qty'] += 1
                                            pass
        if _histogramm_data['qty'] > max_anzahl:
            max_anzahl = _histogramm_data['qty']
        histogramm_data.append(_histogramm_data)

    histogramm_uri = []        
    for data in histogramm_data:
        params = {
                   'x[0]': ','.join(map(str, data['bins'])),
                   'y[0]': ','.join(map(str, data['values'])),
                   'title': data['title'],
                   'xlabel': data['x_title'],
                   'ylabel': data['y_title']
        }
        histogramm_uri.append(urllib.parse.urlencode(params))

    frappe.db.sql("UPDATE tabBatch SET histogramm_daten = %(histogramm_daten)s, histogramm_anz_gemessene = %(histogramm_anz_gemessene)s WHERE name = %(name)s",
      {"histogramm_daten": json.dumps(histogramm_uri), "histogramm_anz_gemessene": max_anzahl, "name": batch}, as_list=True)
    return histogramm_uri

# für Parsen von Histogrammdaten in Jinja
@frappe.whitelist()
def json_loads(data):
    return json.loads(data)

# Prüfen auf Existenz eines Templates in Jinja
@frappe.whitelist()
def template_exists(path):
    if not path.startswith('templates/'):
        return False
    full_path = os.path.join(frappe.get_app_path('senstech'), path)
    return os.path.exists(full_path)

@frappe.whitelist()
def print_multiple_label_pdf(printer_name, contents):
    label_printer = frappe.get_doc("Label Printer", printer_name)
    if isinstance(contents, six.string_types):
        contents = json.loads(contents)
    
    # Create a multi-page PDF with several labels for each batch (based on 'verpackungseinheit')
    output = PdfFileWriter()
    for content in contents:
        item = frappe.get_doc("Item", content[0])
        if item.verpackungseinheit > 0:
            loops = int(content[1] / item.verpackungseinheit)
            loop_qty = item.verpackungseinheit
            item_code = content[0]
            if item.artikelcode_kunde:
                item_code = item.artikelcode_kunde
            # One label per full packing size
            for i in range(loops):
                create_single_label_pdf(label_printer, item, content[2], loop_qty, output)
            # Optional extra label for remaining quantity
            if (loops * loop_qty) < content[1]:
                create_single_label_pdf(label_printer, item, content[2], (content[1] - (loops * loop_qty)), output)
    
    # print the merged pdf
    filedata = read_multi_pdf(output)
    direct_print_pdf(filedata, printer_name)


def create_single_label_pdf(label_printer, item, batch, qty, output=None):

    options = { 
        'page-width': '{0}mm'.format(label_printer.width), 
        'page-height': '{0}mm'.format(label_printer.height), 
        'margin-top': '0mm',
        'margin-bottom': '0mm',
        'margin-left': '0mm',
        'margin-right': '0mm' }
        
    label_content = """
        <div>
            Artikel: {item_code}<br>
            Produktionscharge: {batch}<br>
            Menge: {qty} {stock_uom}
        </div>
    """.format(item_code=item.item_code, batch=batch, qty=qty, stock_uom=item.stock_uom)
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
    </head>
    <body>
        {content}
    <body>
    </html>
    """.format(content=label_content)

    filedata = pdfkit.from_string(html, False, options=options or {})
    
    if output:
        reader = PdfFileReader(io.BytesIO(filedata))
        output.appendPagesFromReader(reader)
        return output
    else:
        return filedata


@frappe.whitelist()
def unlinke_email_queue(communication):
    frappe.db.sql("""UPDATE `tabEmail Queue` SET `communication` = '' WHERE `communication` = '{communication}'""".format(communication=communication), as_list=True)
    frappe.db.commit()

@frappe.whitelist()
def add_freeze_pdf_to_dt(dt, dn, printformat, language=''):
   
    if not language:
        language = frappe.get_doc(dt, dn).language or 'de'

    filedata = attach_print(doctype=dt, name=dn, print_format=printformat, lang=language)
    fpath = frappe.get_site_path('private', 'files', filedata['fname'])

    with open(fpath, "wb") as w:
        w.write(filedata['fcontent'])

    file_record = {
        "doctype": "File",
        "file_url": '/private/files/{0}'.format(filedata['fname']),
        "file_name": filedata['fname'],
        "attached_to_doctype": dt,
        "attached_to_name": dn,
        "folder": 'Home/Attachments',
        "file_size": 0,
        "is_private": 1
    }
    if not frappe.db.exists(file_record):
        f = frappe.get_doc(file_record)
        f.flags.ignore_permissions = True
        f.insert()
        frappe.db.commit()

    return

@frappe.whitelist()
def add_cancelled_watermark(dt, dn):

    fname = "{0}.pdf".format(dn)
    _fname = "{0}_cancelled.pdf".format(dn)
    input_file_fpath = str(frappe.get_site_path('private', 'files', fname))
    output_file_fpath = str(frappe.get_site_path('private', 'files', _fname))

    pdf_file = input_file_fpath
    merged = output_file_fpath
    watermark = frappe.get_site_path('public', 'pdf', 'abgebrochen.pdf')

    try:
        with open(pdf_file, "rb") as input_file, open(watermark, "rb") as watermark_file:
            input_pdf = PdfFileReader(input_file)
            watermark_pdf = PdfFileReader(watermark_file)
            watermark_page = watermark_pdf.getPage(0)

            output = PdfFileWriter()

            for i in range(input_pdf.getNumPages()):
                pdf_page = input_pdf.getPage(i)
                pdf_page.mergePage(watermark_page)
                output.addPage(pdf_page)

            with open(merged, "wb") as merged_file:
                output.write(merged_file)

    except FileNotFoundError as e:
        pass

    f = frappe.get_doc({
        "doctype": "File",
        "file_url": '/private/files/{0}'.format(_fname),
        "file_name": _fname,
        "attached_to_doctype": dt,
        "attached_to_name": dn,
        "folder": 'Home/Attachments',
        "file_size": 0,
        "is_private": 1
    })
    f.flags.ignore_permissions = True
    f.insert()
    frappe.db.commit()
    
    
    files = frappe.get_all('File', filters={'attached_to_doctype': dt, 'attached_to_name': dn}, fields=['name', 'file_url'])
    for file in files:
        if file.file_url == '/private/files/{0}'.format(fname):
            f_to_remove = frappe.get_doc('File', file.name)
            f_to_remove.delete()
    
    if os.path.exists(input_file_fpath):
        os.remove(input_file_fpath)
    
    return


def direct_print_pdf(pdf_data, printer_name):

    label_printer = frappe.get_doc("Label Printer", printer_name)
    soc = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    soc.connect((label_printer.hostname, label_printer.port))
    soc.sendall(pdf_data)
    soc.close()
    
    return


@frappe.whitelist()
def direct_print_doc(doctype, name, print_format, printer_name):

    pdfcontent = frappe.get_print(doctype, name, print_format, as_pdf=True)
    direct_print_pdf(pdfcontent, printer_name)
    
    return
    
@frappe.whitelist()
def change_blanket_order_to_date(bo, date, bis_auf_weiteres):
    if bis_auf_weiteres == "1":
        date = '2099-12-31'
    frappe.db.sql("""UPDATE `tabBlanket Order` SET `to_date` = '{date}', `bis_auf_weiteres` = '{baw}' WHERE `name` = '{bo}'""".format(date=date, bo=bo, baw=bis_auf_weiteres), as_list=True)
    return


@frappe.whitelist()
def get_item_variant_description(item):
    item_doc = frappe.get_doc("Item", item)
    item_desc = '<ul>'
    for attr in item_doc.attributes:
        attr_doc = frappe.get_doc("Item Attribute", attr.attribute)
        item_desc += '<li>' + _(attr_doc.display_name) + ': ' + _(attr.attribute_value) + '</li>'
    item_desc += '</ul>'
    return item_desc