# -*- coding: utf-8 -*-
#
# tools.py
# Functions used by client-side scripts for several DocTypes
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _, attach_print
from frappe.contacts.doctype.address.address import get_address_display
import json, socket, os, six
from PyPDF2 import PdfFileWriter, PdfFileReader
import tempfile


# Bestimmtes Druckformat eines Dokumentes direkt auf Zebra-Etikettendrucker ausgeben
@frappe.whitelist()
def direct_print_doc(doctype, name, print_format, printer_name):

    pdfcontent = frappe.get_print(doctype, name, print_format, as_pdf=True)
    direct_print_pdf(pdfcontent, printer_name)


# Summe der Lagereinbuchungen einer Charge sowie Chargenfreigabestatus des zugehörigen Artikels abfragen
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


# Autom. Adress-Update beim Speichern (Verkaufsdokumente)
@frappe.whitelist()
def update_address_display(doctype, doc_name, fields, addresses, as_list=False):
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


# Autom. PDF-Anhang bei Buchen (Verkaufsdokumente)
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


# Wasserzeichen "Abgebrochen" bei Dok-Abbruch (Verkaufsdokumente)
@frappe.whitelist()
def add_cancelled_watermark(dt, dn):

    fname = "{0}.pdf".format(dn)
    _fname = "{0}_cancelled.pdf".format(dn)
    input_file_fpath = str(frappe.get_site_path('private', 'files', fname))
    output_file_fpath = str(frappe.get_site_path('private', 'files', _fname))

    pdf_file = input_file_fpath
    merged = output_file_fpath
    watermark = frappe.get_app_path('senstech', 'public', 'pdf', 'abgebrochen.pdf')

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


# Senstech Wiki URL (wird global aus senstech.js abgefragt)
@frappe.whitelist()
def get_help_links():
    sql_query = """SELECT * FROM `tabEinstellungen Dokumentation DocTypes`"""
    links = frappe.db.sql(sql_query, as_dict=True)
    if links:
        return links
    else:
        return False


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


# Angehängte Zeichnungen von Artikeln automatisch an Einkaufsdokument (RQ, PO) anhängen
@frappe.whitelist()
def transfer_item_drawings(dt, dn, items):
    if isinstance(items, six.string_types):
        items = json.loads(items)
    counter = 0
    for _item in items:
        item = frappe.get_doc("Item", _item)
        if item.zeichnung:
            file_url = item.zeichnung
            filename = get_file_name(file_url)
            if len(check_if_attachment_exists(file_url, dn)) < 1:
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


# PDF-Dokument (aus Variable) über Socket Connection direkt an Zebra-Etikettendrucker senden
def direct_print_pdf(pdf_data, printer_name):
    label_printer = frappe.get_doc("Label Printer", printer_name)

    # PDF in eine Datei schreiben, geht wohl nicht anders?
    tmp_pdf = tempfile.TemporaryFile()
    tmp_pdf.write(pdf_data)
    tmp_pdf.seek(0)

    # Dokumentbreite ermitteln
    pdf_reader = PdfFileReader(tmp_pdf)
    print_width = pdf_reader.pages[0].mediaBox.getWidth()*25.4/72 # point zu mm
    zebra_width = round(print_width*203/25.4) # mm zu Zebra-point bei 203 dpi
    tmp_pdf.close()

    # Drucker auf gleiche Breite einstellen
    soc = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    soc.connect((label_printer.hostname, label_printer.port))
    soc.sendall("! U1 setvar \"ezpl.print_width\" \"{width}\"\r\n".format(width=zebra_width).encode())

    # Dokument senden
    soc.sendall(pdf_data)
    soc.close()
    return


# Dateiname eines Attachments aus URL ermitteln
def get_file_name(file_url):
    return frappe.db.sql("""SELECT `file_name` FROM `tabFile` WHERE `file_url` = '{file_url}' LIMIT 1""".format(file_url=file_url), as_list=True)[0][0]


# Sicherstellen dass attachment existiert
def check_if_attachment_exists(file_url, dn):
    return frappe.db.sql("""SELECT `name` FROM `tabFile` WHERE `file_url` = '{file_url}' AND `attached_to_name` = '{dn}'""".format(file_url=file_url, dn=dn), as_list=True)
