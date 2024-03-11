# -*- coding: utf-8 -*-
#
# sales_order_tools.py
# Functions used by client-side scripts for DocType "Sales Order"
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _
from frappe.utils.data import today,add_days


@frappe.whitelist()
def calculate_versanddatum(so):
    sales_order = frappe.get_doc("Sales Order", so)
    vorlauf = frappe.get_doc("Customer", sales_order.customer).vorlaufzeit_versand
    if not vorlauf or vorlauf == 0:
        if sales_order.territory == "Schweiz":
            vorlauf = 1
        else:
            vorlauf = 7
    try:
        new_date = add_days(sales_order.delivery_date, vorlauf * -1)
        frappe.db.sql("""UPDATE `tabSales Order` SET `versanddatum` = '{new_date}' WHERE `name` = '{so}'""".format(new_date=new_date, so=so), as_list=True)
        frappe.db.commit()
        return 'updated'
    except:
        return 'passed'
