# Copyright (c) 2013, libracore AG and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.utils.data import add_days
from frappe import _

def execute(filters=None):
	data = []
	columns = [
		{"label": _("Sales Order"), "fieldname": "sales_order", "fieldtype": "Link", "options": "Sales Order"},
		{"label": _("Customer"), "fieldname": "customer", "fieldtype": "Link", "options": "Customer"},
		{"label": _("Customer Name"), "fieldname": "customer_name", "fieldtype": "Data"},
		{"label": _("Liefertermin"), "fieldname": "liefertermin", "fieldtype": "Date"},
		{"label": _("Vorlaufzeit Versand"), "fieldname": "vorlaufzeit", "fieldtype": "Int"},
		{"label": _("Versanddatum"), "fieldname": "versanddatum", "fieldtype": "Date"}
	]
	
	sales_order_to_deliver = frappe.db.sql("""SELECT `name` FROM `tabSales Order` WHERE `per_delivered` < 100 AND `docstatus` = 1""", as_dict=True)
	for so in sales_order_to_deliver:
		_data = []
		_data.append(so.name)
		
		so_detail = frappe.get_doc("Sales Order", so.name)
		_data.append(so_detail.customer)
		_data.append(so_detail.customer_name)
		_data.append(so_detail.delivery_date)
		
		customer = frappe.get_doc("Customer", so_detail.customer)
		_data.append(customer.vorlaufzeit_versand)
		
		vorlaufzeit_versand_negativ = customer.vorlaufzeit_versand * -1
		versanddatum = add_days(so_detail.delivery_date, vorlaufzeit_versand_negativ)
		_data.append(versanddatum)
		
		data.append(_data)
	
	return columns, data
