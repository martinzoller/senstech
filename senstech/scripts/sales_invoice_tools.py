# -*- coding: utf-8 -*-
#
# sales_invoice_tools.py
# Functions used by client-side scripts for DocType "Sales Invoice"
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _
from frappe.utils.data import today


@frappe.whitelist()
def create_payment(sinv):
    try:
        sinv = frappe.get_doc("Sales Invoice", sinv)
        pe = frappe.get_doc({
            "doctype": "Payment Entry",
            'posting_date': today(),
            "payment_type": "Receive",
            "party_type": "Customer",
            "party": sinv.customer,
            "paid_from": '1100 - Forderungen Schweiz - ST',
            'paid_to': '1020 - KK ZKB 1042-0171.171 - ST',
            'paid_amount': sinv.outstanding_amount,
            'received_amount': sinv.outstanding_amount,
            "references": [
                {
                    "reference_doctype": "Sales Invoice",
                    'reference_name': sinv.name,
                    'allocated_amount': sinv.outstanding_amount
                }
            ],
            "reference_no": sinv.name,
            'reference_date': today(),
            'remarks': 'Auto Payment for {sinv}'.format(sinv=sinv.name)
        })
        pe.insert()
        pe.submit()
        return pe.name
    except Exception as err:
        return err