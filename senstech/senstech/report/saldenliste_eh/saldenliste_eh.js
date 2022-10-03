// Copyright (c) 2022, libracore AG and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Saldenliste EH"] = {
    "filters": [
        {
            "fieldname":"from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": (new Date((new Date()).getFullYear(), 0, 01))
        },
        {
            "fieldname":"to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": new Date()
        },
        {
            "fieldname":"report_type",
            "label": __("Type"),
            "fieldtype": "Select",
            "options": "\nBalance Sheet\nProfit and Loss"
        }
    ]
};
