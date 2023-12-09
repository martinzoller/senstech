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
from senstech.scripts.project_tools import get_next_project_id

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

# Next free item code for purchase items (PT-#####)
@frappe.whitelist()
def get_next_purchase_item_number():
    max_pt_number = frappe.db.sql("""SELECT `name` FROM `tabItem` WHERE `is_purchase_item` = 1 AND `name` LIKE 'PT-%' ORDER BY `name` DESC""", as_list=True)
    raw_pt_number = max_pt_number[0][0]
    pt_number = int(raw_pt_number.replace("PT-", ''))
    new_pt_number = pt_number + 1
    new_pt_number = "PT-"+("0000{pt}".format(pt=new_pt_number))[-5:]
    return new_pt_number

# Next free item code for "Generic Position" sales items (GP-#####)
@frappe.whitelist()
def get_next_sales_gp_number():
    max_gp_number = frappe.db.sql("""SELECT `name` FROM `tabItem` WHERE `is_sales_item` = 1 AND `name` LIKE 'GP-%' ORDER BY `name` DESC""", as_list=True)
    raw_gp_number = max_gp_number[0][0]
    gp_number = int(raw_gp_number.replace("GP-", ''))
    new_gp_number = gp_number + 1
    new_gp_number = "GP-"+("0000{gp}".format(gp=new_gp_number))[-5:]
    return new_gp_number
    
# For all item codes where a certain part equals the filter string, return a certain other part of the item code (unique values only).
# Optionally filter by item group as well.
# e.g. ic_filter_string = "GP-", ic_filter_startpos = 0, ic_part_startpos = 3, ic_part_length = 5 will return the "#####" part of all existing "GP-#####" items
@frappe.whitelist()
def get_filtered_list_of_item_code_parts(ic_filter_string, ic_filter_startpos, ic_part_startpos, ic_part_length, item_group_filter='', only_last=False):
    ic_filter_startpos = int(ic_filter_startpos)
    ic_part_startpos = int(ic_part_startpos)
    sql_query = """SELECT SUBSTRING(`name`,{sel_start},{sel_length}) AS name_part FROM `tabItem` WHERE SUBSTRING(`name`,{where_start},{where_length})='{where_str}'""".format(sel_start=ic_part_startpos+1, sel_length=ic_part_length, where_start=ic_filter_startpos+1, where_length=len(ic_filter_string), where_str=ic_filter_string)
    if item_group_filter != '':
        sql_query += """ AND `item_group` LIKE '{item_group}'""".format(item_group=item_group_filter)
    if only_last:
        sql_query += """ ORDER BY name_part DESC LIMIT 1"""
    else:
        sql_query += """ GROUP BY name_part ORDER BY name_part"""
    query_res = frappe.db.sql(sql_query)
    if only_last:
        if query_res:
            return query_res[0][0]
        else:
            return ''
    else:
        ret_value = []
        for line in query_res:
            ret_value.append(line[0])
        return ret_value

# Return a dictionary (2-digit project no => project or item name) of all projects that exist for the given customer, either as Project doctype or as Items with a project number within the Item Code.
def get_project_list(customer_id):
    next_id = int(get_next_project_id(customer_id)[7:9])
    proj_list = {}
    short_customer_id = customer_id[5:8]
    
    # For each existing project, find the mountain name or another appropriate description
    for pn in range(1,next_id):
        pn_string = ("0{pn}".format(pn=pn))[-2:]
        proj_details = frappe.db.sql("""SELECT `project_title`,`mountain_name` FROM `tabProject` WHERE `project_name` = 'EP-{cust}-{proj}'""".format(cust=short_customer_id, proj=pn_string), as_dict=True)
        title = _("Unbekannt")
        if len(proj_details)>0:
            title = proj_details[0].mountain_name or proj_details[0].project_title
        else:
            # Priorize:
            # 1. Active over disabled items
            # 2. Item templates over other items
            # 3. Items with highest specification index (Rxx)
            # 4. Items with lowest type index (Txx)
            item_details = frappe.db.sql("""SELECT `item_name`,`mountain_name` FROM `tabItem` WHERE SUBSTR(`item_code`,1,3) != 'LF-' AND SUBSTR(`item_code`,3,7) = '-{cust}-{proj}' 
                                            ORDER BY disabled ASC, has_variants DESC, SUBSTR(`item_code`,13,3) DESC, SUBSTR(`item_code`,17,3) ASC LIMIT 1; """.format(cust=short_customer_id, proj=pn_string), as_dict=True)
            if len(item_details)>0:
                title = item_details[0].mountain_name or item_details[0].item_name
        proj_list[pn_string] = title
    return proj_list


# Return the project list from get_project_list(), but formatted as value/label pairs for a Frappe form field
@frappe.whitelist()
def get_project_list_for_select_field(customer_id):
    proj_list = get_project_list(customer_id)
    select_list = []
    for num, title in sorted(proj_list.items()):
        select_list.append({'value': num, 'label': num+' - '+title})
    return select_list

# Return the next free value in a series at a given position of the item code, with another part of the item code held constant, and optionally filtered by item group
@frappe.whitelist()
def get_next_item_code_part(ic_filter_string, ic_filter_startpos, ic_part_startpos, ic_part_length, item_group_filter=''):
    ic_part_length = int(ic_part_length)
    last_existing = get_filtered_list_of_item_code_parts(ic_filter_string, ic_filter_startpos, ic_part_startpos, ic_part_length, item_group_filter, True)
    if last_existing == '':
        next_number = 1
    else:
        next_number = int(last_existing) + 1
    padded_next_no = ('0' * ic_part_length + str(next_number))[-ic_part_length:]
    return padded_next_no

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

# Called by doc_events hook when Item is validated
def validate_item(doc, method):
    # Make sure the mountain is not used elsewhere
    if doc.mountain_name:
        proj = frappe.db.get_value("Senstech Berg", doc.mountain_name, "project")
        if proj and proj != 'EP-'+doc.item_code[3:9]:
            frappe.throw(_("Der Bergname {0} wird schon für das Projekt {1} verwendet").format(doc.mountain_name, proj));
        else:
            mtn_item = frappe.get_doc("Item", {'mountain_name': doc.mountain_name})
            if mtn_item and mtn_item.item_code[3:9] != doc.item_code[3:9]:
                frappe.throw(_("Der Bergname {0} wird schon für Artikel {1} verwendet, der zu einem anderen Projekt gehört").format(doc.mountain_name, mtn_item.item_code));