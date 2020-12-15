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
from frappe.utils.data import today

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
	latest_pt_number = frappe.db.sql("""SELECT `name` FROM `tabItem` WHERE `is_purchase_item` = 1 ORDER BY `creation` DESC""", as_list=True)
	if len(latest_pt_number) > 0:
		raw_pt_number = latest_pt_number[0][0]
		pt_number = int(raw_pt_number.replace("PT-", ''))
		new_pt_number = pt_number + 1
		if new_pt_number < 10:
			new_pt_number = "PT-0000{pt}".format(pt=new_pt_number)
		elif new_pt_number < 100:
			new_pt_number = "PT-000{pt}".format(pt=new_pt_number)
		elif new_pt_number < 1000:
			new_pt_number = "PT-00{pt}".format(pt=new_pt_number)
		elif new_pt_number < 10000:
			new_pt_number = "PT-0{pt}".format(pt=new_pt_number)
		else:
			new_pt_number = "PT-{pt}".format(pt=new_pt_number)
		
		return new_pt_number
	else:
		return 'PT-00001'
		
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
def check_for_batch_quick_stock_entry(batch_no, warehouse):
	if batch_no and warehouse:
		entry_qty = float(frappe.db.sql("""SELECT COUNT(`name`)
			FROM `tabStock Ledger Entry`
			WHERE `warehouse` = '{warehouse}' AND `batch_no` = '{batch_no}'""".format(warehouse=warehouse, batch_no=batch_no), as_list=True)[0][0] or 0)
		return entry_qty
		
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