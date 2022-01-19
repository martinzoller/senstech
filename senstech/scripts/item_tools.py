# -*- coding: utf-8 -*-
#
# item_tools.py
# Functions used by client-side scripts for DocType "Item"
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _
from frappe.utils.data import today, add_days

@frappe.whitelist()
def get_item_variant_description(item):
    item_doc = frappe.get_doc("Item", item)
    item_desc = '<ul>'
    for attr in item_doc.attributes:
        attr_doc = frappe.get_doc("Item Attribute", attr.attribute)
        item_desc += '<li>' + _(attr_doc.display_name) + ': ' + _(attr.attribute_value) + '</li>'
    item_desc += '</ul>'
    return item_desc

@frappe.whitelist()
def get_batch_info(item_code):
    sql_query = """SELECT 
          `batches`.`item_code`, 
          `batches`.`batch_no`, 
          `batches`.`qty`,
		   `batches`.`stock_uom`
        FROM (
          SELECT `item_code`, `batch_no`, SUM(`actual_qty`) AS `qty`, `stock_uom`
          FROM `tabStock Ledger Entry`        
          WHERE `item_code` = '{item_code}'
          GROUP BY `batch_no`) AS `batches`
        LEFT JOIN `tabItem` ON `tabItem`.`item_code` = `batches`.`item_code`
        WHERE `qty` > 0;""".format(item_code=item_code)
    
    data = frappe.db.sql(sql_query, as_dict=1)
    return data

@frappe.whitelist()
def get_next_purchase_item_number():
    latest_pt_number = frappe.db.sql("""SELECT `name` FROM `tabItem` WHERE `is_purchase_item` = 1 AND `name` LIKE 'PT-%' ORDER BY `creation` DESC""", as_list=True)
    raw_pt_number = latest_pt_number[0][0]
    pt_number = int(raw_pt_number.replace("PT-", ''))
    new_pt_number = pt_number + 1
    new_pt_number = "PT-"+("0000{pt}".format(pt=new_pt_number))[-5:]
    return new_pt_number

@frappe.whitelist()
def nachbestellung(item, supplier, qty, taxes):
    lieferzeit = frappe.get_doc("Item", item).lead_time_days or 0
    schedule_date = add_days(today(), lieferzeit)
    
    purchase_order = frappe.get_doc({
        'doctype': 'Purchase Order',
        'supplier': supplier,
        'schedule_date': schedule_date,
        'taxes_and_charges': taxes,
        'items': [{
            'item_code': item,
            'qty': qty,
            'schedule_date': schedule_date
        }]
    }).insert()

    return purchase_order.name