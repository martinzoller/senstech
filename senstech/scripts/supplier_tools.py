# -*- coding: utf-8 -*-
#
# supplier_tools.py
# Functions used by client-side scripts for DocType "Supplier"
#
# Copyright (C) Senstech AG and contributors, 2024
#
import frappe
from frappe import _
from senstech.scripts.tools import get_duns, check_duns_address

# Called by doc_events hook after Supplier is saved
def check_supplier_duns_address(doc, method):
    if doc.duns:
        check_duns_address(doc.duns, doc.country, doc)