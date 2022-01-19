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

@frappe.whitelist()
def submit_measurements(user, item, batch, sensor_id, measurands, values, units, test_results=None, print_label='False', sent_from_host=''):
    try:
        batch_id = frappe.db.exists('Batch',{'item': item, 'chargennummer':batch})
        user_id = frappe.db.get_value('User',{'full_name':user},'name')
        measurands = json.loads(measurands)
        values = json.loads(values)
        units = json.loads(units)
        print_label = bool(json.loads(print_label.lower()))
        if test_results:
            test_results = json.loads(test_results)
        mdocs = []
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
              mdoc['test_result'] = test_results[i]
            if not frappe.db.exists("UOM", mdoc.uom):
                mdoc.uom = frappe.db.exists("UOM", {"symbol": mdoc.uom})
            mdoc.validate()
            mdoc._validate()
            mdoc._validate_links()
            mdocs.append(mdoc)
        for mdoc in mdocs:
            mdoc.save()
            
        frappe.db.commit()
        if print_label:
            direct_print_doc("Senstech Messdaten", mdocs[0].name, "Sensor Flag Label ST", "Zebra Flag Labels")
        return 'OK'
    except Exception as e:
        # Don't send a whole traceback in case of a validation error
        frappe.local.message_log = None
        if hasattr(e, 'message'):
            return(e.message)
        else:
            return(e)

# Read the batch and sensor ID from a given measurement dataset,
# and return this sensor's most recent measurement for each available measurand
# as a hash by measurand, with columns 'timestamp','measurand','value','uom_name','uom_symbol'
@frappe.whitelist()
def get_sensor_measurements(reference_measurement_id):
    ref_doc = frappe.get_doc("Senstech Messdaten", reference_measurement_id)
    docs = frappe.db.sql(("""
        SELECT MAX(md.creation) AS timestamp,measurand,value,md.uom AS uom_name,
               uom.symbol AS uom_symbol
        FROM `tabSenstech Messdaten` md LEFT JOIN `tabUOM` uom ON md.uom = uom.name
        WHERE md.sensor_id='{sensor_id}'
        AND md.batch='{batch}'
        GROUP BY measurand
        ORDER BY measurand"""
    ).format(sensor_id=ref_doc.sensor_id, batch=ref_doc.batch), as_dict=True)
    by_measurand = {}
    for doc in docs:
        by_measurand[doc.measurand] = doc
    return by_measurand
    

class SenstechMessdaten(Document):

    def validate(self):
        base_uom = frappe.get_doc("Senstech Messgroesse", self.measurand).base_uom
        if self.uom != base_uom:
            if get_uom_conv_factor(self.uom, base_uom) == '':
                frappe.throw(_("Unit of measure cannot be converted to measurand's base unit")+" ({from_uom} => {to_uom})".format(from_uom=self.uom, to_uom=base_uom))
