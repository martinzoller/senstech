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
        
# Called by doc_events hook when Sales Order is submitted
def create_dev_batches(doc, method):
    for item in doc.items:
        if item.item_group == 'Entwicklung nach PZ-2000' or item.item_group=='Kleinaufträge nach PZ-2002':
            batch_code = doc.name+"-P"+str(item.position)+"A"
            if item.item_group == 'Kleinaufträge nach PZ-2002':
                batch_desc = "Kleinauftrag für "+doc.customer_name
            else:
                batch_desc = "Entwicklung für "+doc.customer_name+" ("+doc.project+")"
            dev_batch = {
                "doctype": "Batch",
                "batch_id": batch_code,
                "bezeichnung": batch_code+" - "+batch_desc,
                "item": item.item_code,
                "artikelbezeichnung": item.item_name,
                "chargennummer": batch_code,
                "stueckzahl": 999,
                "production_launch_date": today(),
            }
            if not frappe.db.exists(dev_batch):
                f = frappe.get_doc(dev_batch)
                f.insert()
                frappe.db.commit()

# Called by doc_events hook when Sales Order is cancelled
def delete_dev_batches(doc, method):
    for item in doc.items:
        if item.item_group == 'Entwicklung nach PZ-2000' or item.item_group=='Kleinaufträge nach PZ-2002':
            batch_code = doc.name+"-P"+str(item.position)+"A"
            frappe.delete_doc("Batch", batch_code)
            frappe.db.commit()