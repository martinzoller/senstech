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