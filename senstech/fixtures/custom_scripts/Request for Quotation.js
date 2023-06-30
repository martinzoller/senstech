frappe.ui.form.on('Request for Quotation', {
    before_save(frm) {
		if (!cur_frm.doc.taxes_and_charges) {
		    fetch_taxes_and_charges_from_supplier(frm);
		}
	},
	after_save(frm) {
		if (!frm.doc.__islocal) {
		    var items = new Array();
            cur_frm.doc.items.forEach(function(entry) {
            	if (entry.item_code != null) {
            		items.push(entry.item_code);
            	} 
            });
		    frappe.call({
            	method: 'senstech.scripts.tools.transfer_item_drawings',
            	args: {
					dt: 'Request for Quotation',
            		dn: cur_frm.doc.name,
            		items: items
            	},
            	callback: function(r) {
            	    if (r.message > 0) {
            	        cur_frm.reload_doc();
            	    }
            	}
            });
		}
	},
    onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    supplier(frm) {
        if (!cur_frm.doc.taxes_and_charges) {
            setTimeout(function(){
                fetch_taxes_and_charges_from_supplier(frm);
            }, 1000);
        }
    },
    validate(frm) {
		if (!frm.doc.taxes_and_charges) {
	        frappe.msgprint( __("Bitte Vorlage für Verkaufssteuern und -abgaben hinterlegen"), __("Validation") );
            frappe.validated=false;
	        frm.scroll_to_field('taxes_and_charges');
	    }
		let pos_numbers = [];
		frm.doc.items.forEach(function(entry) {
			if(!entry.description || entry.description == '<div><br></div>'){
				entry.description = entry.item_name;
			}
			if(pos_numbers.includes(entry.position)) {
					frappe.msgprint( __("Doppelte Positionsnummer:")+" "+entry.position, __("Validation") );
					frappe.validated=false;
			}
			else if(entry.position == 0) {
					frappe.msgprint( __("Positionsnummern müssen grösser Null sein"), __("Validation") );
					frappe.validated=false;
			}
			else {
				pos_numbers.push(entry.position);
			}
		});
    },
    refresh(frm) {
        if (cur_frm.doc.supplier_address && cur_frm.doc.shipping_address) {
            update_address_display(frm, ['address_display', 'shipping_address_display'], [cur_frm.doc.supplier_address, cur_frm.doc.shipping_address], true);
        } else {
            if (cur_frm.doc.supplier_address) {
                update_address_display(frm, 'address_display', cur_frm.doc.supplier_address, false);
            }
            if (cur_frm.doc.shipping_address) {
                update_address_display(frm, 'shipping_address_display', cur_frm.doc.shipping_address, false);
            }
        }
	},
    before_submit(frm) {
        cur_frm.doc.submitted_by = frappe.user.name;
    },
    on_submit(frm) {
        attach_pdf_print(frm);
    },
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
})

frappe.ui.form.on('Request for Quotation Item', {
	items_add: function(frm, cdt, cdn) {
      var current_item = locals[cdt][cdn];
      var all_items = cur_frm.doc.items;
      var row_qty = all_items.length;
      if (row_qty == current_item.idx) {
          var new_pos = 10;
          if (current_item.idx != 1) {
              var prev_idx = current_item.idx - 1;
              all_items.forEach(function(entry) {
                if (entry.idx == prev_idx) {
                    new_pos = parseInt(entry.position) + 10;
                }  
              });
          }
          frappe.model.set_value(cdt, cdn, 'position', new_pos);
      } else {
          var new_pos = 1;
          if (current_item.idx != 1) {
              var prev_idx = current_item.idx - 1;
              all_items.forEach(function(entry) {
                if (entry.idx == prev_idx) {
                    new_pos = parseInt(entry.position) + 1;
                }  
              });
          }
          frappe.model.set_value(cdt, cdn, 'position', new_pos);
      }
   }
})

function update_address_display(frm, fields, addresses, as_list=false) {
    if (!as_list) {
        as_list = '';
    }
    frappe.call({
        "method": "senstech.scripts.tools.update_address_display",
        "args": {
            "doctype": cur_frm.doctype,
            "doc_name": cur_frm.docname,
            "fields": fields,
            "addresses": addresses,
            'as_list': as_list
        },
        "callback": function(response) {
            var response = response.message;
            if (!as_list) {
                if (response == 'updated') {
                    cur_frm.reload_doc();
                }
            } else {
                if (response.includes('updated')) {
                    cur_frm.reload_doc();
                }
            }
        }
    });
}

function fetch_taxes_and_charges_from_supplier(frm) {
    if(!cur_frm.doc.supplier) {
        return;
    }
    frappe.call({
        "method": "frappe.client.get",
        "args": {
            "doctype": "Supplier",
            "name": cur_frm.doc.supplier
        },
        "callback": function(response) {
            var supplier = response.message;
            if (supplier.taxes_and_charges) {
                cur_frm.set_value('taxes_and_charges', supplier.taxes_and_charges);
            }
        }
    });
}

function attach_pdf_print(frm) {
    frappe.call({
        "method": "senstech.scripts.tools.add_freeze_pdf_to_dt",
        "args": {
            "dt": cur_frm.doctype,
            "dn": cur_frm.docname,
            "printformat": 'Request for Quotation ST'
        },
        "callback": function(response) {
            cur_frm.reload_doc();
        }
    });
}

function add_cancelled_watermark(frm) {
    frappe.call({
        "method": "senstech.scripts.tools.add_cancelled_watermark",
        "args": {
            "dt": cur_frm.doctype,
            "dn": cur_frm.docname
        },
        "callback": function(response) {
            cur_frm.reload_doc();
        }
    });
}