# -*- coding: utf-8 -*-
#
# project_tools.py
# Functions used by client-side scripts for DocType "Project"
#
# Copyright (C) Senstech AG and contributors, 2023
#
import frappe
from frappe import _

@frappe.whitelist()
def get_next_project_id(customer_id):
    prefix = 'EP-'
    short_customer_id = customer_id[5:8]
    latest_no = 0
    latest_from_proj = frappe.db.sql("""SELECT SUBSTR(`project_name`,8,2) AS project_no FROM `tabProject` WHERE SUBSTR(`project_name`,3,5) = '-{cust}-' GROUP BY `project_no` ORDER BY `project_no` DESC LIMIT 1""".format(cust=short_customer_id), as_list=True)
    if len(latest_from_proj)>0:
        latest_no = int(latest_from_proj[0][0])
    latest_from_item = frappe.db.sql("""SELECT SUBSTR(`item_code`,8,2) AS project_no FROM `tabItem` WHERE SUBSTR(`item_code`,1,3) != 'LF-' AND SUBSTR(`item_code`,3,5) = '-{cust}-' GROUP BY `project_no` ORDER BY `project_no` DESC LIMIT 1""".format(cust=short_customer_id), as_list=True)
    if len(latest_from_item)>0:
        latest_from_item = int(latest_from_item[0][0])
        latest_no = max(latest_no, latest_from_item)
    
    next_no = latest_no + 1
    next_proj_id = prefix+short_customer_id+"-"+("0{no}".format(no=next_no))[-2:]
    return next_proj_id

# Called by doc_events hook when Project is created or updated
def register_mountain(doc, method):
    deregister_mountain(doc, method)
    if doc.mountain_name:
        mtn = frappe.get_doc("Senstech Berg", doc.mountain_name)
        mtn.project = doc.project_name
        mtn.save()
        frappe.db.commit()

# Called by doc_events hook when Project is deleted
def deregister_mountain(doc, method):
    mtn = frappe.db.exists("Senstech Berg", {'project': doc.project_name})
    if mtn:
        frappe.db.set_value("Senstech Berg", mtn, 'project', None)
        frappe.db.commit()