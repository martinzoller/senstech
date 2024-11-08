# -*- coding: utf-8 -*-
#
# batch_tools.py
# Functions used by client-side scripts for DocType "Batch"
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _
import csv, math, datetime, workalendar.europe, urllib.parse, json
from erpnext.stock.doctype.item.item import get_item_defaults
from erpnext.setup.doctype.item_group.item_group import get_item_group_defaults


# Add items to stock using button (only for items where no batch clearance is required)
@frappe.whitelist()
def batch_quick_stock_entry(batch_no, warehouse, item, qty):
    stock_entry = frappe.get_doc({
        'doctype': 'Stock Entry',
        'stock_entry_type': "Material Receipt",
        'to_warehouse': warehouse,
        'items': [{
            'item_code': item,
            'qty': qty,
            'batch_no': batch_no
        }]
    }).insert()
    stock_entry.submit()

    return stock_entry.name

# Return the appropriate default warehouse for an item
def get_item_warehouse(item_code):
    my_company = frappe.defaults.get_global_default('company')
    item_wh = get_item_defaults(item_code, my_company).get('default_warehouse')
    group_wh = get_item_group_defaults(item_code, my_company).get('default_warehouse')
    global_wh =  frappe.defaults.get_defaults().default_warehouse
    return item_wh or group_wh or global_wh or ''
    

# Make a stock entry when a batch is cleared; cancel the entry when clearance is revoked
def batch_auto_stock_entry(doc, method):
    if not hasattr(doc,'__islocal'):
        prev_doc = frappe.get_doc(doc.doctype, doc.name)
        if doc.freigabedatum and not prev_doc.freigabedatum:
            # Batch clearance has been granted
            batch_quick_stock_entry(doc.name, get_item_warehouse(doc.item), doc.item, doc.stueckzahl)
            frappe.msgprint(_("{0} Stück an Lager gelegt").format(doc.stueckzahl), alert=True, indicator='green')
        elif prev_doc.freigabedatum and not doc.freigabedatum:
            # Batch clearance has been revoked
            auto_stock_entry = frappe.db.get_list(
                "Stock Entry",
                fields = ("name"),
                filters = {
                    ("stock_entry_type", "=", "Material Receipt"),
                    ("docstatus", "=", 1),
                    ("Stock Entry Detail", "batch_no", "=", doc.name),
                    ("Stock Entry Detail", "qty", "=", doc.stueckzahl)
                },
                order_by = "name DESC",
                limit = 1
            )
            if auto_stock_entry:
                found_entry = frappe.get_doc("Stock Entry", auto_stock_entry[0].name)
                found_entry.cancel()
                frappe.db.commit()
                frappe.msgprint(_("Lagerbuchung {0} abgebrochen").format(auto_stock_entry[0].name), alert=True, indicator='green')
            else:
                frappe.msgprint(_("Lagereinbuchung konnte nicht abgebrochen werden, bitte Lagerbuch manuell prüfen"), indicator='red')

@frappe.whitelist()
def get_histogramm_data(item, batch, messdaten_nullpunkt=None, messdaten_last=None):
    histogramm_data = []
    max_anzahl = 0
    item = frappe.get_doc("Item", item)
    for _histogramm in item.histogramme:
        histogramm = frappe.get_doc("Senstech Histogramm", _histogramm.histogramm)
        _histogramm_data = {
            'title': histogramm.histogramm_titel,
            'x_title': histogramm.x_beschriftung,
            'y_title': histogramm.y_beschriftung,
            'bins': [],
            'bin_range': [],
            'values': [],
            'qty': 0
        }
        data_row = histogramm.daten_spalte
        for bin in histogramm.klassen:
            _histogramm_data['bin_range'].append([bin.range_von, bin.range_bis])
            _histogramm_data['values'].append(0)
            _histogramm_data['bins'].append(bin.bezeichnung)

        if messdaten_nullpunkt:
            with open(frappe.get_site_path(messdaten_nullpunkt.strip('/')), 'r') as f:
                reader = csv.reader(f, dialect='excel', delimiter='\t')
                first_row = True
                data_row_found = False
                data_row_int = 0
                for row in reader:
                    if first_row:
                        for num, _data_row in enumerate(row):
                            if _data_row == data_row:
                                data_row_found = True
                                first_row = False
                                data_row_int = num
                    else:
                        if data_row_found:
                            for num, bin_range in enumerate(_histogramm_data['bin_range']):
                                    if float(row[data_row_int]) >= float(bin_range[0]):
                                        if float(row[data_row_int]) < float(bin_range[1]):
                                            _histogramm_data['values'][num] += 1
                                            _histogramm_data['qty'] += 1
                                            pass
        if messdaten_last:
            with open(frappe.get_site_path(messdaten_last.strip('/')), 'r') as f:
                reader = csv.reader(f, dialect='excel', delimiter='\t')
                first_row = True
                data_row_found = False
                data_row_int = 0
                for row in reader:
                    if first_row:
                        for num, _data_row in enumerate(row):
                            if _data_row == data_row:
                                data_row_found = True
                                first_row = False
                                data_row_int = num
                    else:
                        if data_row_found:
                            for num, bin_range in enumerate(_histogramm_data['bin_range']):
                                    if float(row[data_row_int]) >= float(bin_range[0]):
                                        if float(row[data_row_int]) < float(bin_range[1]):
                                            _histogramm_data['values'][num] += 1
                                            _histogramm_data['qty'] += 1
                                            pass
        if _histogramm_data['qty'] > max_anzahl:
            max_anzahl = _histogramm_data['qty']
        histogramm_data.append(_histogramm_data)

    histogramm_uri = []        
    for data in histogramm_data:
        params = {
                   'x[0]': ','.join(map(str, data['bins'])),
                   'y[0]': ','.join(map(str, data['values'])),
                   'title': data['title'],
                   'xlabel': data['x_title'],
                   'ylabel': data['y_title']
        }
        histogramm_uri.append(urllib.parse.urlencode(params))

    frappe.db.sql("UPDATE tabBatch SET histogramm_daten = %(histogramm_daten)s, histogramm_anz_gemessene = %(histogramm_anz_gemessene)s WHERE name = %(name)s",
      {"histogramm_daten": json.dumps(histogramm_uri), "histogramm_anz_gemessene": max_anzahl, "name": batch}, as_list=True)
    return histogramm_uri


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


@frappe.whitelist()
def get_pilot_series_qty(item_code):
    my_company = frappe.defaults.get_global_default('company')
    item_defaults = get_item_defaults(item_code, my_company)    
    result = frappe.db.sql("""
        SELECT
          SUM(CASE WHEN sle.actual_qty > 0 THEN sle.actual_qty ELSE 0 END) AS entered_stock_qty
        FROM
          `tabBatch` batch
          LEFT JOIN `tabStock Ledger Entry` sle ON sle.batch_no = batch.name AND sle.docstatus < 2 AND sle.warehouse='{warehouse}'
        WHERE
          batch.item = '{item_code}' AND
          batch.batch_type = 'Nullserie'
        """.format(
          item_code = item_code,
          warehouse = item_defaults.default_warehouse,
        ), as_dict=True)
    if len(result) == 1:
        return result[0].entered_stock_qty
    else:
        return 0

@frappe.whitelist()
def get_next_batch_no(batch_type, item_code = None, project = None, sales_order = None):
    if batch_type == 'Serieprodukt' or batch_type == 'Nullserie':
        if not item_code:
            return None
        item_doc = frappe.get_doc('Item', item_code)
        if not item_doc:
            return None
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
                prev_sub_batch = latest_batch.chargennummer[5:]
                next_sub_batch = get_next_sub_batch(prev_sub_batch)
                next_batch = latest_batch.chargennummer[0:5]+next_sub_batch
            else:
                next_batch = ('%02d/' % (int(latest_batch.chargennummer[0:2])+1)) + this_year
                if item_doc.has_sub_batches:
                    next_batch += 'A'
        else:
            next_batch = '01/'+this_year
            if item_doc.has_sub_batches:
                next_batch += 'A'
    
    elif batch_type == 'Entwicklung':
        if not project:
            return None
        cust_str = project[3:6]
        proj_str = project[7:9]
        sql_query = """SELECT `chargennummer`
            FROM `tabBatch`
            WHERE LEFT(`chargennummer`,7)='EP{cust}{proj}'
            ORDER BY `chargennummer` DESC LIMIT 1;""".format(cust=cust_str,proj=proj_str)
        latest_batch = frappe.db.sql(sql_query, as_dict=1)
        if len(latest_batch) == 1:
            latest_batch = latest_batch[0].chargennummer
            next_batch = latest_batch[0:7] + get_next_sub_batch(latest_batch[7:])
        else:
            next_batch = 'EP'+cust_str+proj_str+'A'
    
    elif batch_type == 'Lohnfertigung/Kleinauftrag':
        if not sales_order:
            return None
        soid = sales_order[3:8]
        sql_query = """SELECT `chargennummer`
            FROM `tabBatch`
            WHERE LEFT(`chargennummer`,7)='SO{soid}'
            ORDER BY `chargennummer` DESC LIMIT 1;""".format(soid=soid)
        latest_batch = frappe.db.sql(sql_query, as_dict=1)
        if len(latest_batch) == 1:
            latest_batch = latest_batch[0].chargennummer
            next_batch = latest_batch[0:7] + get_next_sub_batch(latest_batch[7:])
        else:
            next_batch = 'SO'+soid+'A'
    
    return next_batch
            
# Count the sub-batch letter code up by one (A, B, ..., Z, AA, AB, etc.)
# Returns 'A' if an empty string is passed
def get_next_sub_batch(prev_sub_batch):
    # '@' is the character before 'A' and is used as a zero padding
    # '[' is the character after 'Z', we add one to the end as an initial 'carryover'
    sub_batch = list('@'+prev_sub_batch.strip()+'[')
    for i in range(1,len(sub_batch)):
        if sub_batch[-i] == '[':
            sub_batch[-i] = 'A'
            sub_batch[-(i+1)] = chr(ord(sub_batch[-(i+1)])+1)
    # Remove leading zero ('@') if still present
    # Also remove the carryover character at the end
    sub_batch = ''.join(sub_batch).replace('@','')
    return sub_batch[:-1]


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