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