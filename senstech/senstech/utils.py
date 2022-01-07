# Copyright (c) 2019-2020, libracore and contributors
# For license information, please see license.txt

import frappe
import workalendar.europe
import datetime
import math
from frappe import _
from erpnext.stock.get_item_details import get_item_defaults

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
def get_next_batch_no(item_code):
    item_doc = frappe.get_doc('Item', item_code)
    this_year = datetime.date.today().strftime("%y")
    sql_query = """SELECT `chargennummer`,`creation` 
        FROM `tabBatch`
        WHERE MID(`chargennummer`,4,2)='{year}'
        AND item='{item}'
        ORDER BY CONCAT(LEFT(`chargennummer`,2),TRIM(MID(`chargennummer`,6))) DESC LIMIT 1;""".format(year=this_year,item=item_code)
    
    latest_batch = frappe.db.sql(sql_query, as_dict=1)
    if len(latest_batch) == 1:
        latest_batch = latest_batch[0]
        # Create another batch on same day: Assume next sub-batch, if applicable
        if item_doc.has_sub_batches and latest_batch.creation.date() == datetime.date.today():
            prev_sub_batch = latest_batch.chargennummer[5:].strip()
            if prev_sub_batch == '':
                next_sub_batch = 'A'
            else:
                next_sub_batch = chr(ord(prev_sub_batch[0])+1)
            next_batch = latest_batch.chargennummer[0:5] + ' ' + next_sub_batch
        else:
            next_batch = ('%02d/' % (int(latest_batch.chargennummer[0:2])+1)) + this_year
            if item_doc.has_sub_batches:
                next_batch += ' A'
    else:
        next_batch = '01/'+this_year
        if item_doc.has_sub_batches:
            next_batch += ' A'
    return next_batch


@frappe.whitelist()
def get_batch_production_details(batch):
    zurich_cal = workalendar.europe.Zurich()
    batch_doc = frappe.get_doc('Batch', batch)
    item_doc = frappe.get_doc('Item', batch_doc.item)
    
    my_company = frappe.defaults.get_global_default('company')
    item_defaults = get_item_defaults(batch_doc.item, my_company)    
    stock_summary = frappe.db.sql("""
        SELECT
          batch.chargennummer AS chargennummer,
          batch.production_launch_date AS production_launch_date,
          batch.stueckzahl AS max_qty,
          SUM(CASE WHEN sle.actual_qty > 0 THEN sle.actual_qty ELSE 0 END) AS entered_stock_qty,
          IFNULL(SUM(sle.actual_qty), 0) AS remaining_stock_qty,
          (CASE WHEN
            batch.batch_completed = 0
          THEN
            FLOOR(batch.stueckzahl * (1 - {reject_percentage}/100))
            - SUM(CASE WHEN sle.actual_qty > 0 THEN sle.actual_qty ELSE 0 END)
          ELSE
            0
          END) AS projected_remaining_mfg_qty,
          batch.batch_completed AS completed
        FROM
          `tabBatch` batch
          LEFT JOIN `tabStock Ledger Entry` sle ON sle.batch_no = batch.name AND sle.docstatus < 2 AND sle.warehouse='{warehouse}'
        WHERE
          batch.name='{batch}'
        """.format(
          batch = batch,
          warehouse = item_defaults.default_warehouse,
          reject_percentage = item_doc.reject_percentage
        ), as_dict=True)
    
    if len(stock_summary) == 1:
        stock_summary = stock_summary[0]
        if stock_summary.production_launch_date and stock_summary.completed == 0 and item_doc.mfg_duration > 0:
            launch_date_dt = str_to_dt(stock_summary.production_launch_date)
            ready_date_dt = zurich_cal.add_working_days(launch_date_dt, item_doc.mfg_duration)
            completion = dt_to_local_str(ready_date_dt)
        else:
            completion = _('Unknown')
        return {
                'expected_qty': math.floor(batch_doc.stueckzahl * (1 - item_doc.reject_percentage/100)),
                'entered_qty': stock_summary.entered_stock_qty,
                'projected_remaining_mfg_qty': stock_summary.projected_remaining_mfg_qty,
                'remaining_qty': stock_summary.remaining_stock_qty,
                'completion': completion,
                'completed': stock_summary.completed,
                'reject': item_doc.reject_percentage
               }
    else:
        return None
    
    
# Frappe 'YYYY-MM-DD' to Python datetime.date
# Modified to also accept datetime.date as input, since apparently some SQL DATE columns are returned as datetime.date by frappe.db.sql.
def str_to_dt(datestr):
    if isinstance(datestr, datetime.date):
        return datestr
    else:
        return datetime.datetime.strptime(datestr,'%Y-%m-%d').date()

# Python datetime.date to Swiss 'DD.MM.YYYY'
def dt_to_local_str(dt):
    return dt.strftime('%d.%m.%Y')