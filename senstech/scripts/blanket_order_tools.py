# -*- coding: utf-8 -*-
#
# blanket_order_tools.py
# Functions used by client-side scripts for DocType "Blanket Order"
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _


@frappe.whitelist()
def change_blanket_order_to_date(bo, date, bis_auf_weiteres):
    if bis_auf_weiteres == "1":
        date = '2099-12-31'
    frappe.db.sql("""UPDATE `tabBlanket Order` SET `to_date` = '{date}', `bis_auf_weiteres` = '{baw}' WHERE `name` = '{bo}'""".format(date=date, bo=bo, baw=bis_auf_weiteres), as_list=True)
    return
