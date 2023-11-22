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
def get_next_project_id(project_type):
    if project_type == 'Intern':
        prefix = 'IP-'
    else:
        prefix = 'CP-'
    latest_id = frappe.db.sql("""SELECT `project_name` FROM `tabProject` WHERE `name` LIKE '{prefix}%' ORDER BY `creation` DESC LIMIT 1""".format(prefix=prefix), as_list=True)
    if len(latest_id)>0:
        raw_id = latest_id[0][0]
        numeric_id = int(raw_id.replace(prefix, ''))
    else:
        numeric_id = 0
    next_num_id = numeric_id + 1
    next_id = prefix+("0000{numid}".format(numid=next_num_id))[-5:]
    return next_id