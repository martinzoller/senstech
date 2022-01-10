# -*- coding: utf-8 -*-
#
# communication_tools.py
# Functions used by client-side scripts for DocType "Communication"
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _


@frappe.whitelist()
def unlink_email_queue(communication):
    frappe.db.sql("""UPDATE `tabEmail Queue` SET `communication` = '' WHERE `communication` = '{communication}'""".format(communication=communication), as_list=True)
    frappe.db.commit()