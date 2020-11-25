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