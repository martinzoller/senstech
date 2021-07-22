from __future__ import unicode_literals
import frappe, erpnext
from frappe import _
from frappe.utils import flt
from erpnext.stock.get_item_details import get_item_defaults
from senstech.senstech.utils import str_to_dt, dt_to_local_str
import workalendar.europe
import datetime

def execute(filters=None):
    columns = [
        {"label": _("Sales Order"), "fieldname": "sales_order", "fieldtype": "Link", "options": "Sales Order"},
        {"label": _("Blanket Order"), "fieldname": "blanket_order", "fieldtype": "Data"},
        {"label": _("Abruf Nr."), "fieldname": "abruf_nr", "fieldtype": "Int"},
        {"label": _("Noch zu liefern"), "fieldname": "qty_to_deliver", "fieldtype": "Float"},
        {"label": _("Versanddatum"), "fieldname": "versanddatum", "fieldtype": "Date"},
        {"label": _("Voraussichtlich bereit am"), "fieldname": "ready_date", "fieldtype": "Data", "width": 170},
        {"label": _("Produktionschargen"), "fieldname": "batches", "fieldtype": "Data", "width": 370},
        {"label": _("Ampel"), "fieldname": "mfg_status", "fieldtype": "Data"}
    ]
    
    if not filters.customer:
        filters.customer = frappe.db.get_value('Item', filters.item, 'kunde')
    
    my_company = frappe.defaults.get_global_default('company')
    item_defaults = get_item_defaults(filters.item, my_company)
    mfg_duration = frappe.db.get_value('Item', filters.item, 'mfg_duration')
    reject_percentage = frappe.db.get_value('Item', filters.item, 'reject_percentage')
    zurich_cal = workalendar.europe.Zurich()
    
    sales_orders = get_sales_orders(filters)
    # In Datenzeilen von sales_orders nachträglich einzufügen:
    # - batches (Auflistung von Chargennrn. zur Erfüllung des SO, kommagetrennt)
    # - ready_date (Voraussichtliche Fertigstellung der letzten benötigten Charge)
    # - mfg_status (🟢grün = an Lager, 🟡gelb = Produktion rechtzeitig fertig, 🔴rot = nicht abgedeckt)
    # - Mindestlagerbestände je Rahmenauftrag: Wohl zu behandeln wie Sales Order mit Versanddatum 31.12.2099? d.h. es reicht in jedem Fall wenn Produktion gestartet ist.
    
    blanket_orders = get_blanket_orders_with_mq(filters)
    for bo in blanket_orders:
        sales_orders.append(bo)
    
    batches = get_batch_stock_summary(filters.item, item_defaults.default_warehouse, reject_percentage)
    cur_batch = 0
    has_stock = True

    for so in list(sales_orders):
        # We don't want fully delivered SOs in the report but we need them in the query to calculate abruf_nr
        if so.qty_to_deliver == 0:
            sales_orders.remove(so)
            continue
    
        used_batches = get_delivered_batches_from_so(filters.item, so.sales_order)
        left_to_cover = so.qty_to_deliver
        so.ready_date = _('An Lager')
        so.mfg_status = '🟢' #green
        
        # The available/planned batches are processed as follows:
        # 1. Go through list and subtract from remaining_stock_qty until end of list reached and all positions zero => fill "green" positions
        # 2. Go through list again and subtract from projected_remaining_mfg_qty where completed=0 and production_launch_date is set. => Status is orange if production_launch_date is early enough for timely delivery, red otherwise.
        # 3. If end of list is reached a second time, all remaining sales orders will get status red with no ready_date.
        # Note that for batches without production_launch_date, only items in stock are considered, as this field is required to reliably calculate a ready date. (The field shall be declared mandatory in the future.)
        
        if has_stock:
            while left_to_cover > 0 and cur_batch < len(batches):
                if batches[cur_batch].remaining_stock_qty > 0:
                    use_qty = min(batches[cur_batch].remaining_stock_qty, left_to_cover)
                    batches[cur_batch].remaining_stock_qty -= use_qty
                    left_to_cover -= use_qty
                    used_batches.append("%s (%d %s)" % (batches[cur_batch].chargennummer, use_qty, _("Stk")))
                else:
                    cur_batch += 1
            if cur_batch == len(batches):
                has_stock = False
                cur_batch = 0
        
        if not has_stock:
            while left_to_cover > 0 and cur_batch < len(batches):
                if batches[cur_batch].production_launch_date and batches[cur_batch].projected_remaining_mfg_qty > 0 and batches[cur_batch].completed == 0:
                    use_qty = min(batches[cur_batch].projected_remaining_mfg_qty, left_to_cover)
                    batches[cur_batch].projected_remaining_mfg_qty -= use_qty
                    left_to_cover -= use_qty
                    used_batches.append("%s (%d %s)" % (batches[cur_batch].chargennummer, use_qty, _("Stk")))
                    launch_date_dt = str_to_dt(batches[cur_batch].production_launch_date)
                    ready_date_dt = zurich_cal.add_working_days(launch_date_dt, mfg_duration)
                    so.ready_date = dt_to_local_str(ready_date_dt)
                    if ready_date_dt < str_to_dt(so.versanddatum):
                        so.mfg_status = '🟡' #yellow
                    else:
                        so.mfg_status = '🔴' #red
                else:
                    cur_batch += 1
            if left_to_cover > 0:
                so.mfg_status = '🔴' #red
                so.ready_date = _('Unbekannt (%d Stk fehlen)') % left_to_cover
        
        so.batches = ', '.join(used_batches)
        
            
    return columns, sales_orders
    
    

# Builds a list of sales orders and calculates their remaining quantity to deliver,
# using Delivery Notes in case of closed/stopped Sales Orders.
# Further calculates an order index (abruf_nr) for each Sales Order within a Blanket Order, in order of shipping dates.
# Also returns Sales Orders that are not linked to Delivery Notes or to a Blanket Order.
def get_sales_orders(filters):
    so_data = frappe.db.sql("""   
        SELECT
          so.name AS sales_order,
          bo.name AS blanket_order,
          (CASE WHEN bo.name IS NOT NULL
            THEN ROW_NUMBER() OVER(PARTITION BY bo.name ORDER BY so.versanddatum)
            ELSE NULL
          END) AS abruf_nr,
          (CASE WHEN so.status NOT IN ('Closed', 'Stopped')
            THEN SUM(soi.stock_qty) - SUM(IFNULL(soi.delivered_qty, 0))
            ELSE 0
          END) AS qty_to_deliver,
          so.versanddatum AS versanddatum
          
        FROM
          `tabSales Order` so
          INNER JOIN `tabSales Order Item` soi ON soi.parent = so.name
          LEFT JOIN (
            `tabBlanket Order Item` boi INNER JOIN `tabBlanket Order` bo ON bo.name = boi.parent
          ) ON boi.item_code = soi.item_code AND bo.name = soi.blanket_order AND bo.docstatus = 1
        WHERE
          soi.item_code = '{item_code}' AND
          so.customer = '{customer}' AND
          so.docstatus = 1
        GROUP BY
          so.name
        ORDER BY
          so.versanddatum
        """.format(
          item_code = filters.item,
          customer = filters.customer
        ), as_dict=True)
    
    return so_data


# Query to get all batches with non-zero stock balance or outstanding manufacturing quantity
# (inspired by batch_wise_balance_history.get_stock_ledger_entries)
def get_batch_stock_summary(item_code, warehouse, reject_percentage):

    # The problem is that Senstech batches can start being delivered before being completed (Philips / Arcomed).
    # Therefore we have to put them all in one list, in the following order:
    # 1. Batches that are complete and that have stock left to deliver
    # 2. Batches that are not yet complete but that have some stock ready
    # 3. Batches that have no stock ready at the moment, but have a production_launch_date set, in logical order of batch number (NN/YY X: first YY, then NN, then X)
    return frappe.db.sql("""
        SELECT
          batch.chargennummer AS chargennummer,
          batch.production_launch_date AS production_launch_date,
          batch.stueckzahl AS max_qty,
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
          batch.item='{item_code}'
        GROUP BY
          batch.name
        HAVING
          remaining_stock_qty > 0 OR
          (production_launch_date <> '' AND projected_remaining_mfg_qty > 0)
        ORDER BY
          (SUM(sle.actual_qty) > 0) DESC,
          completed DESC,
          MID(chargennummer,4,2), MID(chargennummer,1,2), TRIM(MID(chargennummer,6))
        """.format(
          item_code = item_code,
          warehouse = warehouse,
          reject_percentage = reject_percentage
        ), as_dict=True)


# Get a list of batches from which items were delivered
def get_delivered_batches_from_so(item_code, sales_order):
    so_batches = frappe.db.sql_list("""
        SELECT
          CONCAT(dni.chargennummer,' (',FLOOR(dni.qty),' {stk_text})') AS chargennummer
        FROM
          `tabDelivery Note Item` dni
          INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
        WHERE
          dni.item_code = '{item_code}' AND
          dni.against_sales_order = '{against_sales_order}' AND
          dn.docstatus = 1
        GROUP BY
          dni.chargennummer
        ORDER BY
          dni.idx
        """.format(
          stk_text = _("Stk"),
          item_code = item_code,
          against_sales_order = sales_order
        ))
    return so_batches


# Get active Blanket Orders with minimum stock quantity for an Item
# Use same data format as for Sales Orders query
def get_blanket_orders_with_mq(filters):
    blanket_orders = frappe.db.sql("""
        SELECT
          '{msq_text}' AS sales_order,
          bo.name AS blanket_order,
          NULL AS abruf_nr,
          SUM(boi.min_stock_qty) AS qty_to_deliver,
          '2099-12-31' AS versanddatum
        FROM
          `tabSales Order` so
          INNER JOIN `tabSales Order Item` soi ON soi.parent = so.name
          INNER JOIN `tabBlanket Order Item` boi ON boi.item_code = soi.item_code
          INNER JOIN `tabBlanket Order` bo ON bo.name = boi.parent AND bo.name = soi.blanket_order AND bo.docstatus = 1
        WHERE
          soi.item_code = '{item_code}' AND
          so.customer = '{customer}' AND
          so.docstatus = 1 AND
          bo.from_date <= CURDATE() AND
          bo.to_date >= CURDATE()
        GROUP BY
          bo.name
    """.format(
      msq_text = _("Mindestbestand"),
      item_code = filters.item,
      customer = filters.customer
    ), as_dict=True)
    return blanket_orders




# discarded / unnecessary query fragments:
"""
SELECT ....
  GROUP_CONCAT(dni.chargennummer SEPARATOR ', ') AS chargen,
  ...
  DATEADD(day, -`tabItem`.`vorlaufzeit_versand`, `tabSales Order Item`.`delivery_date`) as \"versanddatum\",
  ...
FROM
  ...
  LEFT JOIN (
    `tabDelivery Note Item` dni INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
  ) ON dni.so_detail = soi.name AND dn.docstatus = 1



SELECT
  GROUP_CONCAT(dni.chargennummer SEPARATOR ', ') AS chargen
FROM
  `tabDelivery Note Item` dni
  INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
WHERE
  dni.item_code = '{item_code}' AND
  dni.against_sales_order = '{against_sales_order}'
GROUP BY
  dni.item_code
ORDER BY
  dni.idx
  
  
frappe.db.get_list('Batch',{ fields: ['name'], filters: {item: cur_frm.doc.item}, order_by: 'MID(chargennummer,4,2) DESC, MID(chargennummer,1,2) DESC, TRIM(MID(chargennummer,6)) DESC', limit: 100} ).then(f => {console.log(f)})
"""  