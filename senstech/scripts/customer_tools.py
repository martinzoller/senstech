# -*- coding: utf-8 -*-
#
# supplier_tools.py
# Functions used by client-side scripts for DocType "Customer"
#
# Copyright (C) Senstech AG and contributors, 2024
#
import frappe
from frappe import _
from senstech.scripts.tools import get_duns, check_duns_address

# Called by doc_events hook after Customer is saved
def check_customer_duns_address(doc, method):
    if doc.duns and frappe.db.exists("Country", doc.territory):
        check_duns_address(doc.duns, doc.territory, doc)