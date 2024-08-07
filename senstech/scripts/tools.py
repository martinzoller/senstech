# -*- coding: utf-8 -*-
#
# tools.py
# Functions used by client-side scripts for several DocTypes
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _, attach_print
from frappe.contacts.doctype.address.address import get_address_display, address_query
from frappe.utils import cint
import json, socket, os, six
from PyPDF2 import PdfFileWriter, PdfFileReader
import tempfile
import erpnextswiss.erpnextswiss.attach_pdf
import requests


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


# Create PDF attachment via JS (used by senstech.js to recreate missing attachments)
@frappe.whitelist()
def add_freeze_pdf_to_dt(dt, dn, printformat, language=''):
    doc = frappe.get_doc(dt, dn)
    fallback_language = frappe.db.get_single_value("System Settings", "language") or "de"
    args = {
        "doctype": dt,
        "name": dn,
        "title": getattr(doc, "title", doc.name),
        "print_format": printformat,
        "lang": language or fallback_language,
    }
    erpnextswiss.erpnextswiss.attach_pdf.execute(**args)


# Called by doc_events hook when purchasing or sales docs are submitted
def attach_pdf_hook(doc, event=None):
    fallback_language = frappe.db.get_single_value("System Settings", "language") or "de"
    args = {
        "doctype": doc.doctype,
        "name": doc.name,
        "title": getattr(doc, "title", doc.name),
        "lang": getattr(doc, "language", fallback_language),
    }
    erpnextswiss.erpnextswiss.attach_pdf.execute(**args)
    # QN: Create Gate1 checklist as separate document
    if doc.doctype == 'Quotation' and event == 'on_submit' and doc.gate1_reviewed_date:
        erpnextswiss.erpnextswiss.attach_pdf.execute(
            doctype = doc.doctype,
            name = doc.name,
            title = "Gate 1 Checklist",
            lang = "de",
            print_format = "Gate 1 Checklist ST",
            file_name = doc.name+"-Gate1.pdf"
        )
    

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


# Hochgeladene Datei an Dokument hängen
@frappe.whitelist()
def attach_file_to_document(file_url, doctype, docname, field=''):
    exists = frappe.db.exists("File",{
        "file_url": file_url,
        "attached_to_doctype": doctype,
        "attached_to_name": docname,
        "attached_to_field": field
    });
    if exists:
        return True
    else:
        file_query = frappe.get_all(
            "File",
            ["name"],
            order_by="creation desc",
            limit_page_length=1,
            filters={"file_url": file_url, "attached_to_doctype": ""}
        )
        if len(file_query)==1:
            myfile = frappe.get_doc("File", file_query[0].name)
            myfile.attached_to_doctype = doctype
            myfile.attached_to_name = docname
            myfile.attached_to_field = field
            myfile.save()
            frappe.db.commit()
            return True
        else:
            return False

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


# Bild-URL der Unterschrift zurückgeben (auch ohne Zugriffsrecht auf jew. Employee-Datensatz)
def get_signature_for_user_id(user_id):
    return frappe.get_doc("Employee", {"user_id": user_id}).unterschrift

def get_signature_for_name(employee_name):
    return frappe.get_doc("Employee", {"employee_name": employee_name}).unterschrift

def get_employee_name(user_id):
    return frappe.get_doc("Employee", {"user_id": user_id}).employee_name

def text_field_empty(val):
    return (not val) or val == '<div><br></div>'

# Search for a D-U-N-S number on DnB's website
# (needs to be done from server side due to CORS headers)
# Example result: 
# {'companyAddress': 'An der Schilde 3',
#  'companyRegion': 'Badow',
#  'companyZipCode': '19209',
#  'duns': '343973149',
#  'primaryName': 'ASDF Holding GmbH'}
@frappe.whitelist()
def get_duns(search_term, country, street='', city=''):

    # Default user agent seems to be rejected, so use a common one instead
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.1',
    }
    
    country_doc = frappe.get_doc("Country", country);
    if not country_doc.code:
        return False
    country_code = country_doc.code.upper()
    
    params = {
        'countryCode': country_code,
        'location': city,
        'searchTerm': search_term,
        'streetAddress': street,
    }
    try:
        response = requests.get('https://www.dnb.com/apps/dnb/servlets/cleanseMatchServlet', params=params, headers=headers)
        if response.ok:
            json = response.json()
            if 'companies' in json:
                first_res = json['companies'][0]
                return first_res
            else:
                return False
        else:
            return False
    except requests.exceptions.RequestException as e:
        frappe.msgprint(_("DUNS-Abfrage fehlgeschlagen"), alert=True, indicator='red')
        return False


# Check if the address in a DUNS record already exists and add it to customer/supplier if necessary
def check_duns_address(duns, country, ref_doc):
    duns_rec = get_duns(duns, country)
    if duns_rec and duns_rec['duns'] == duns:
        # Check if we already have this address on file
        # (TODO: Find a better way to check for NULL in filters below)
        filters= { "link_doctype": ref_doc.doctype,
                   "link_name": ref_doc.name,
                   "(abweichender_firmennamen": "'' OR abweichender_firmennamen IS NULL)",
                   "address_line1": frappe.db.escape(duns_rec['companyAddress']),
                   "(address_line2": "'' OR address_line2 IS NULL)",
                   "(address_line3": "'' OR address_line3 IS NULL)",
                   "pincode": frappe.db.escape(duns_rec['companyZipCode']),
                   "city": frappe.db.escape(duns_rec['companyRegion']),
                   "country": frappe.db.escape(country),
                 }
        q=address_query(filters=filters,start=0,page_len=1,doctype="Address",searchfield="",txt="")
        if len(q)==0:
            # No matching address: First clear any existing (differing) "DUNS" address
            filters= { "link_doctype": ref_doc.doctype,
                       "link_name": ref_doc.name,
                       "address_type": "'DUNS'",
                     }
            q=address_query(filters=filters,start=0,page_len=1,doctype="Address",searchfield="",txt="")
            if len(q)>0:
                frappe.delete_doc("Address", q[0][0])
            # Then create one and tag it as "DUNS"-type address
            duns_addr = frappe.new_doc("Address")
            duns_addr.address_line1 = duns_rec['companyAddress']
            duns_addr.pincode = duns_rec['companyZipCode']
            duns_addr.city = duns_rec['companyRegion']
            duns_addr.country = country
            duns_addr.address_type = "DUNS"
            duns_addr.append('links', dict(link_doctype=ref_doc.doctype, link_name=ref_doc.name))
            duns_addr.save()
            frappe.db.commit()
            frappe.msgprint(_("Adresse gemäss DUNS-Eintrag angelegt"), alert=True, indicator='green')


# Update list prices of the line items where the user agreed to do so
@frappe.whitelist()
def set_price_list_rates(doc, sel_items):

    if isinstance(doc, six.string_types):
        doc = json.loads(doc)
    if isinstance(sel_items, six.string_types):
        sel_items = json.loads(sel_items)
        
    if cint(frappe.db.get_single_value("Stock Settings", "auto_insert_price_list_rate_if_missing")):
        frappe.msgprint(_("Bitte automatische Preisspeicherung in den Lager-Einstellungen deaktivieren"), alert=True, indicator='red')
        return
    # The following is just a warning as editing the list prices in docs will not do much harm
    if cint(frappe.db.get_default("editable_price_list_rate")):
        frappe.msgprint(_("Bitte in den Vertriebseinstellungen das Bearbeiten von Listenpreisen innerhalb von Transaktionen verbieten"), alert=True, indicator='orange')
    price_list = doc.get('selling_price_list') or doc.get('buying_price_list')
    doc_currency = doc['currency']
    if price_list and frappe.db.get_value("Price List", price_list, "currency", cache=True) == doc_currency:
        # Require price_not_uom_dependent - which in reality means the contrary, i.e. list price WILL be converted to target UOM in purchasing/sales docs
        if frappe.db.get_value("Price List", price_list, "price_not_uom_dependent", cache=True) == False:
            frappe.msgprint(_("Bei der Preisliste '{0}' ist das Häkchen für UOM-Abhängigkeit nicht gesetzt, dieses ist für die korrekte Anwendung von Listenpreisen erforderlich", [price_list]), alert=True, indicator='red')
            return
        if frappe.has_permission("Item Price", "write"):
            for idx in sel_items:
                line_item = doc['items'][int(idx)]
                item_code = line_item['item_code']
                has_list_price = frappe.db.get_value("Item Group", line_item['item_group'], "has_list_price")
                conversion_factor = line_item.get('conversion_factor') or 1
                price_list_rate = line_item['rate'] / conversion_factor
                if has_list_price and price_list_rate > 0:
                    item_prices = frappe.db.get_list('Item Price',
                        {'item_code': item_code, 'price_list': price_list, 'currency': doc_currency},
                        ['name', 'price_list_rate', 'min_qty', 'valid_upto'])
                    if len(item_prices):
                        if len(item_prices) > 1 or item_prices[0].min_qty != 1 or item_prices[0].valid_upto:
                            frappe.msgprint(_("Preis für Artikel {0} kann nicht gespeichert werden: Preisliste {1} enthält Staffelpreise oder mehrere Preiseinträge").format(item_code, price_list), alert=True, indicator='red')
                        else:
                            if item_prices[0].price_list_rate != price_list_rate:
                                frappe.db.set_value('Item Price', item_prices[0].name, "price_list_rate", price_list_rate)
                                frappe.msgprint(_("Item Price updated for {0} in Price List {1}").format(item_code,
                                    price_list), alert=True, indicator='green')
                            else:
                                frappe.msgprint(_("Listenpreis für {0} in Preisliste {1} beträgt bereits {2} {3:.2f}").format(item_code,
                                    price_list, doc_currency, price_list_rate), alert=True, indicator='green')
                    else:
                        item_price = frappe.get_doc({
                            "doctype": "Item Price",
                            "price_list": price_list,
                            "item_code": item_code,
                            "currency": doc_currency,
                            "price_list_rate": price_list_rate
                        })
                        item_price.insert()
                        frappe.msgprint(_("Item Price added for {0} in Price List {1}").format(item_code,
                            price_list), alert=True, indicator='green')
        else:
            frappe.msgprint(_("Preise nicht gespeichert: Benutzer hat kein Schreibrecht auf Artikelpreisen"), alert=True, indicator='red')
    else:
        frappe.msgprint(_("Preise nicht gespeichert: Keine Preisliste in passender Währung gefunden"), alert=True, indicator='red')