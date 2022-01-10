# -*- coding: utf-8 -*-
#
# stock_entry_tools.py
# Functions used by client-side scripts for DocType "Stock Entry"
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _

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

