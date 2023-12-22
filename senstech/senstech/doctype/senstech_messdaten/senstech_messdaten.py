# -*- coding: utf-8 -*-
# Copyright (c) 2022, libracore AG and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
import json
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime
from erpnext.stock.doctype.item.item import get_uom_conv_factor
from senstech.scripts.tools import direct_print_doc
from senstech.scripts.delivery_note_tools import sanitize_sensor_ids

# Called by Vee programs to submit sensor data
# The 'label_printer' argument is no longer in use since we now support printing two labels on two different printers
# TODO: Label printer names are hardcoded for now - an appropriate abstraction will have to be found once we need more than one measuring station
#       (eg. add a table field to Print Format with fields "host" and "label_printer" - thereby defining which printer should be used for a given {measuring_station, print_format} pair)
#       (other approach: add a "Senstech Messstation" doctype which has a hostname and two fields for label printers - one for rectangle labels and one for flag labels)
@frappe.whitelist()
def submit_measurements(user, item, batch, sensor_id, measurands, values, units, test_results=None, print_label='False', sent_from_host='', label_printer='dummy argument'):
    try:
        batch_id = frappe.db.exists('Batch', {'item': item, 'chargennummer':batch})
        user_id = frappe.db.get_value('User', {'full_name':user}, 'name')
        measurands = json.loads(measurands)
        values = json.loads(values)
        units = json.loads(units)
        print_label = bool(json.loads(print_label.lower()))
        if test_results:
            test_results = json.loads(test_results)
        mdocs = []
        overall_fail_result = False
        measured_before = frappe.db.exists('Senstech Messdaten', {'batch': batch_id, 'sensor_id': sensor_id, 'measurand': ['in', measurands]})
        for i,val in enumerate(values):
            mdoc = frappe.get_doc({
              'doctype': 'Senstech Messdaten',
              'batch': batch_id,
              'sensor_id': sensor_id,              
              'measurand': measurands[i],
              'value': val,
              'uom': units[i],             
              'measured_by': user_id,
              'sent_from_host': sent_from_host,
              '_action': 'save'
            })
            if test_results:
              mdoc.test_result = test_results[i]
              if mdoc.test_result != 'PASS' and mdoc.test_result != 'NONE':
                overall_fail_result = True
            if not frappe.db.exists("UOM", mdoc.uom):
                mdoc.uom = frappe.db.exists("UOM", {"symbol": mdoc.uom})
            mdoc.validate()
            mdoc._validate()
            mdoc._validate_links()
            mdocs.append(mdoc)
        for mdoc in mdocs:
            mdoc.save()
        frappe.db.commit()
        
        if print_label and not overall_fail_result:
            print_single_sensor_labels(mdocs[0].name)
        if measured_before:
            return 'measured_before' # If sensor has been measured before, Vee will show a warning, but the data is saved anyway
        else:
            return 'OK'
    except Exception as e:
        # Don't send a whole traceback in case of a validation error
        frappe.local.message_log = None
        if hasattr(e, 'message'):
            return(e.message)
        else:
            return(e)

# Triggered by submit_measurements() as well as a JS button to manually reprint labels.
# Given the ID of a "Senstech Messdaten" doc, will print the appropriate single-sensor labels defined for the Item in question,
# using the referenced sensor's most recent measurement data.
@frappe.whitelist()
def print_single_sensor_labels(measurement_id):
    data_doc = frappe.get_doc("Senstech Messdaten", measurement_id)
    batch_doc = frappe.get_doc("Batch", data_doc.batch)
    item_doc = frappe.get_doc("Item", batch_doc.item)
    rectangle_pf = item_doc.single_label_print_format
    flag_pf = item_doc.flag_label_print_format
    if (not rectangle_pf) and (not flag_pf):
        rectangle_pf = "Sensor Rectangle Label ST"
    if rectangle_pf:
        direct_print_doc("Senstech Messdaten", measurement_id, rectangle_pf, "Zebra Rectangle Labels")
    if flag_pf:
        direct_print_doc("Senstech Messdaten", measurement_id, flag_pf, "Zebra Flag Labels")


# Read the batch and sensor ID from a given measurement dataset,
# and return this sensor's most recent measurement for each available measurand
# as a hash by measurand, with columns 'timestamp','measurand','value','uom_name','uom_symbol'
@frappe.whitelist()
def get_sensor_measurements(reference_measurement_id):
    ref_doc = frappe.get_doc("Senstech Messdaten", reference_measurement_id)
    docs = frappe.db.sql(("""
      SELECT
        md.creation,
        md.measurand,
        md.value,
        md.uom AS uom_name,
        uom.symbol AS uom_symbol
      FROM
        (SELECT measurand,MAX(creation) AS creation FROM `tabSenstech Messdaten` WHERE sensor_id='{sensor_id}' AND batch='{batch}' GROUP BY measurand) AS latest_md
        INNER JOIN `tabSenstech Messdaten` md ON latest_md.measurand = md.measurand AND latest_md.creation = md.creation
        LEFT JOIN `tabUOM` uom ON md.uom = uom.name
      ORDER BY measurand"""
    ).format(sensor_id=ref_doc.sensor_id, batch=ref_doc.batch), as_dict=True)
    by_measurand = {}
    for doc in docs:
        by_measurand[doc.measurand] = doc
    return by_measurand


# Return a list of dicts containing measurand, uom_name and uom_symbol
# for each measurand that has data linked with the delivery note and batch of the given delivery note item
def get_measurands_for_delivery_note_item(delivery_note_item):

    item_doc = frappe.get_doc("Delivery Note Item", delivery_note_item)
    dn_doc = frappe.get_doc("Delivery Note", item_doc.parent)
    
    if not item_doc.sensor_ids_list:
        return {}
    
    if dn_doc.docstatus == 1:
        # Submitted document: Look for measurements linked to the delivery note
        measurand_condition = "batch='{batch}' AND included_in_delivery='{delivery_note}'"
    else:
        # Draft document: Look for sensors by ID
        measurand_condition = "batch='{batch}' AND sensor_id IN ({sensor_ids})"
    
    # Assume the UOM is the same for all measurements (to be verified when fetching the actual data)
    measurands = frappe.db.sql(("""
        SELECT
          md.measurand AS measurand,
          md.uom AS uom_name,
          uom.symbol as uom_symbol
        FROM
          `tabSenstech Messdaten` md LEFT JOIN `tabUOM` uom ON md.uom = uom.name
        WHERE
          """+measurand_condition+"""
        GROUP BY
          measurand
    """).format(batch=item_doc.batch_no, delivery_note=item_doc.parent, sensor_ids=sanitize_sensor_ids(item_doc.sensor_ids_list)), as_dict=True)
    return measurands


# Returns a list of dicts, each containing 'sensor_id' and a key-value pair for each measurand.
# The values are the measurement values without UOM.
def get_measurements_for_delivery_note_item(delivery_note_item, measurands):
    data = []
    item_doc = frappe.get_doc("Delivery Note Item", delivery_note_item)
    dn_doc = frappe.get_doc("Delivery Note", item_doc.parent)
    
    # The measurands from get_measurands_for_delivery_note_item are passed as a parameter to avoid calling the function twice
    #measurands = get_measurands_for_delivery_note_item(delivery_note_item)
    
    if not item_doc.sensor_ids_list:
        frappe.throw(_('Fehler: Lieferschein-Artikel "{item}" enthält keine Sensor-IDs').format(item=item_doc.name))
        return
    
    if dn_doc.docstatus == 1:
        # Submitted document: Look for measurements linked to the delivery note
        measurement_query = """
            SELECT
              value,
              uom,
              creation,
              measured_by
            FROM
              `tabSenstech Messdaten`
            WHERE
              sensor_id='{sensor}' AND
              measurand='{measurand}' AND
              batch='{batch}' AND
              included_in_delivery='{delivery_note}'
        """
    else:
        # Draft document: Look for latest measurements of concerned sensors
        measurement_query = """
            SELECT
              md.value AS value,
              md.uom AS uom,
              md.creation AS creation,
              md.measured_by AS measured_by
            FROM
              (SELECT MAX(creation) AS maxcreation FROM `tabSenstech Messdaten` WHERE sensor_id='{sensor}' AND measurand='{measurand}' AND batch='{batch}') AS latest_md
              INNER JOIN `tabSenstech Messdaten` md ON maxcreation = md.creation
            WHERE
              sensor_id='{sensor}' AND
              measurand='{measurand}' AND
              batch='{batch}'
        """
    
    sensor_ids = item_doc.sensor_ids_list.split(',')
    sensor_ids.sort()
    for sensor in sensor_ids:
        padded_snsr = sensor.zfill(4)
        sensor_batch_id = item_doc.chargennummer+'/'+padded_snsr;
        cur_sensor = {'sensor_id': padded_snsr}
        measured_on = []
        measured_by = []
        for m in measurands:
            cur_value = frappe.db.sql(measurement_query.format(sensor=sensor, measurand=m.measurand, batch=item_doc.batch_no, delivery_note=item_doc.parent), as_dict=True)
            if len(cur_value) != 1:
                frappe.throw(_('Fehler: Kein eindeutiger Messwert für "{measurand}" hinterlegt zu Sensor {sensor} (Artikel: {item})').format(measurand=m.measurand, sensor=sensor_batch_id, item=item_doc.item_code))
                return
            if cur_value[0].uom != m.uom_name:
                frappe.throw(_('Fehler: Abweichende Masseinheit für "{measurand}" bei Sensor {sensor} (Artikel: {item})').format(measurand=m.measurand, sensor=sensor_batch_id, item=item_doc.item_code))
                return
            creation_date = cur_value[0].creation.date().strftime('%d.%m.%Y')
            operator = frappe.get_doc("User",cur_value[0].measured_by).full_name
            if creation_date not in measured_on:
                measured_on.append(creation_date)
            if operator not in measured_by:
                measured_by.append(operator)
            cur_sensor[m.measurand] = cur_value[0].value
        cur_sensor['measured_on'] = measured_on
        cur_sensor['measured_by'] = measured_by
        data.append(cur_sensor)
    
    return data

class SenstechMessdaten(Document):

    def validate(self):
        base_uom = frappe.get_doc("Senstech Messgroesse", self.measurand).base_uom
        if self.uom != base_uom:
            if get_uom_conv_factor(self.uom, base_uom) == '':
                frappe.throw(_("Unit of measure cannot be converted to measurand's base unit")+" ({from_uom} => {to_uom})".format(from_uom=self.uom, to_uom=base_uom))
