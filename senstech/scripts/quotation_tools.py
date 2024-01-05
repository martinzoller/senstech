# -*- coding: utf-8 -*-
#
# quotation_tools.py
# Functions used by client-side scripts for DocType "Quotation"
#
# Copyright (C) Senstech AG and contributors, 2023
#
import frappe
from frappe import _
from erpnext.selling.doctype.quotation.quotation import _make_sales_order

# Allow creating Sales Order for expired Quotation
@frappe.whitelist()
def make_sales_order_ignore_validity(source_name, target_doc=None):
	return _make_sales_order(source_name, target_doc)