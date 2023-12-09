# -*- coding: utf-8 -*-
#
# delivery_note_tools.py
# Functions used by client-side scripts for DocType "Delivery Note"
#
# Copyright (C) Senstech AG and contributors, 2022
#
import frappe
from frappe import _
import json, pdfkit, io, six
from PyPDF2 import PdfFileWriter, PdfFileReader
from frappe.utils.print_format import read_multi_pdf
from senstech.scripts.tools import direct_print_pdf


@frappe.whitelist()
def print_multiple_label_pdf(printer_name, contents):
    label_printer = frappe.get_doc("Label Printer", printer_name)
    if isinstance(contents, six.string_types):
        contents = json.loads(contents)
    
    # Create a multi-page PDF with several labels for each batch (based on 'verpackungseinheit')
    output = PdfFileWriter()
    for content in contents:
        item = frappe.get_doc("Item", content[0])
        if item.verpackungseinheit > 0:
            loops = int(content[1] / item.verpackungseinheit)
            loop_qty = item.verpackungseinheit
            item_code = content[0]
            # One label per full packing size
            for i in range(loops):
                create_single_label_pdf(label_printer, item, content[2], loop_qty, output)
            # Optional extra label for remaining quantity
            if (loops * loop_qty) < content[1]:
                create_single_label_pdf(label_printer, item, content[2], (content[1] - (loops * loop_qty)), output)
        else:
            frappe.msgprint(msg=_('Verpackungseinheit nicht definiert für Artikel:')+' '+item.name, title=_('Fehler'))
    # print the merged pdf
    filedata = read_multi_pdf(output)
    direct_print_pdf(filedata, printer_name)


def create_single_label_pdf(label_printer, item, batch, qty, output=None):

    options = { 
        'page-width': '{0}mm'.format(label_printer.width), 
        'page-height': '{0}mm'.format(label_printer.height), 
        'margin-top': '0mm',
        'margin-bottom': '0mm',
        'margin-left': '0mm',
        'margin-right': '0mm' }
    
    label_html = frappe.render_template("senstech/templates/delivery_note_packing_unit_label.html", {"item": item, "batch": batch, "qty": qty})
    return frappe.utils.pdf.get_pdf(label_html, options, output)
    
# called by doc_events hook when Delivery Note is validated
def validate_sensor_ids(doc, method):
    for item in doc.items:
        if item.sensor_ids_list:
            sensor_ids = item.sensor_ids_list.split(',')
            if len(sensor_ids) != item.qty:
                frappe.throw(_('Von Artikel "{item_name}" sollen {qty} Stück der Charge {chargennummer} geliefert werden, jedoch sind {id_count} Sensor-IDs erfasst').format(item_name=item.item_name,qty=item.qty,chargennummer=item.chargennummer,id_count=len(sensor_ids)))
                return
            for sensor_id in sensor_ids:
                has_data = frappe.db.exists("Senstech Messdaten", {'batch': item.batch_no, 'sensor_id': sensor_id})
                if not has_data:
                    frappe.throw(_('Für Sensor Nr. {chargennummer}/{sensor_id} von Artikel "{item_name}" sind keine Messdaten verfügbar').format(chargennummer=item.chargennummer,sensor_id=sensor_id,item_name=item.item_name))
                    return
                existing_link = frappe.db.exists("Senstech Messdaten", {'batch': item.batch_no, 'sensor_id': sensor_id, 'included_in_delivery': ['!=','']})
                if existing_link:
                    dn_id = frappe.db.get_value("Senstech Messdaten", existing_link, "included_in_delivery")
                    frappe.throw(_('Sensor Nr. {chargennummer}/{sensor_id} von Artikel "{item_name}" ist bereits in Lieferschein {dn_id} enthalten').format(chargennummer=item.chargennummer,sensor_id=sensor_id,item_name=item.item_name,dn_id=dn_id))
                    return

# called by doc_events hook when Delivery Note is submitted
def assign_sensor_ids(doc, method):
    for item in doc.items:
        if item.sensor_ids_list:
            sensor_ids = sanitize_sensor_ids(item.sensor_ids_list)
            frappe.db.sql("""
                UPDATE `tabSenstech Messdaten`
                SET included_in_delivery='{dn_id}', delivered_to_customer='{cust_name}'
                WHERE name IN
                (
                    SELECT md.name FROM
                    (
                        SELECT measurand,sensor_id,MAX(creation) AS creation FROM `tabSenstech Messdaten` WHERE sensor_id IN ({sensor_ids}) AND batch='{batch}' GROUP BY measurand,sensor_id
                    ) AS latest_md
                    INNER JOIN
                    (
                         -- This subquery is needed because of a MySQL quirk, see:
                         -- https://stackoverflow.com/questions/44970574/table-is-specified-twice-both-as-a-target-for-update-and-as-a-separate-source
                         SELECT * FROM `tabSenstech Messdaten`
                    ) AS md
                    ON latest_md.measurand = md.measurand AND latest_md.sensor_id = md.sensor_id AND latest_md.creation = md.creation
                )                           
            """.format(dn_id=doc.name, cust_name=doc.customer_name, sensor_ids=sensor_ids, batch=item.batch_no))
            # The above query will write only the latest measurement record of each sensor and measurand.
            # This is done by first selecting these records by MAX(creation), then finding their names by matching each field from the GROUP BY clause.
            # The resulting list of names is then passed to the UPDATE query.

# called by doc_events hook when Delivery Note is cancelled
def release_sensor_ids(doc, method):
    frappe.db.sql("""
        UPDATE `tabSenstech Messdaten`
        SET included_in_delivery='', delivered_to_customer=''
        WHERE included_in_delivery='{dn_id}'
    """.format(dn_id=doc.name))            
            
        
# Take a string list of sensor IDs, convert each ID to integer and back to string
# (used as minimal data sanitization before SQL query)
def sanitize_sensor_ids(sensor_ids):
    sensor_ids_arr = sensor_ids.split(',')
    sensor_ids_arr = list(map(lambda x: str(int(x)), sensor_ids_arr))
    return ','.join(sensor_ids_arr)