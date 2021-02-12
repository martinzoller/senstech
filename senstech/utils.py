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
import six
from frappe import _
from frappe.utils.data import today, add_days
from frappe.contacts.doctype.address.address import get_address_display
import csv

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
    purchase_order = frappe.get_doc({
        'doctype': 'Purchase Order',
        'supplier': supplier,
        'schedule_date': today(),
        'taxes_and_charges': taxes,
        'items': [{
            'item_code': item,
            'qty': qty,
            'schedule_date': today()
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
def get_histrogramm_data(item, batch, messdaten_nullpunkt=None, messdaten_last=None):
    histrogramm_data = []
    item = frappe.get_doc("Item", item)
    for _histogramm in item.histogramme:
        histogramm = frappe.get_doc("Senstech Histogramm", _histogramm.histogramm)
        _histrogramm_data = {
            'title': histogramm.histogramm_titel,
            'x_title': histogramm.x_beschriftung,
            'y_title': histogramm.y_beschriftung,
            'bins': [],
            'bin_range': [],
            'values': []
        }
        data_row = histogramm.daten_spalte
        for bin in histogramm.klassen:
            _histrogramm_data['bin_range'].append([bin.range_von, bin.range_bis])
            _histrogramm_data['values'].append(0)
            _histrogramm_data['bins'].append(bin.bezeichnung)
            
        if messdaten_nullpunkt:
            with open('/home/frappe/frappe-bench/sites/site1.local/' + messdaten_nullpunkt, 'r') as f:
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
                            for num, bin_range in enumerate(_histrogramm_data['bin_range']):
                                    if float(row[data_row_int]) >= float(bin_range[0]):
                                        if float(row[data_row_int]) <= float(bin_range[1]):
                                            _histrogramm_data['values'][num] += 1
                                            pass
        if messdaten_last:
            with open('/home/frappe/frappe-bench/sites/site1.local/' + messdaten_last, 'r') as f:
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
                            for num, bin_range in enumerate(_histrogramm_data['bin_range']):
                                    if float(row[data_row_int]) >= float(bin_range[0]):
                                        if float(row[data_row_int]) <= float(bin_range[1]):
                                            _histrogramm_data['values'][num] += 1
                                            pass
        histrogramm_data.append(_histrogramm_data)
    frappe.db.sql("""UPDATE `tabBatch` SET `histogramm_daten` = "{histrogramm_data}" WHERE `name` = '{batch}'""".format(histrogramm_data=histrogramm_data, batch=batch), as_list=True)
    return histrogramm_data