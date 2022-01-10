frappe.ui.form.on('Delivery Note', {
    before_save(frm) {
		if (!cur_frm.doc.taxes_and_charges) {
		    fetch_taxes_and_charges_from_customer(frm);
		}
	},
    validate(frm) {
		if (!frm.doc.taxes_and_charges) {
	        frappe.msgprint( __("Bitte Vorlage für Verkaufssteuern und -abgaben hinterlegen"), __("Validation") );
            frappe.validated=false;
	        frm.scroll_to_field('taxes_and_charges');
	    }
	    check_item_links(frm);
        reload_contacts(frm);
    },
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    customer(frm) {
        if (!cur_frm.doc.taxes_and_charges) {
            setTimeout(function(){
                fetch_taxes_and_charges_from_customer(frm);
            }, 1000);
        }
    },
    refresh(frm) {
        if (cur_frm.doc.customer_address && cur_frm.doc.shipping_address_name) {
            update_address_display(frm, ['address_display', 'shipping_address'], [cur_frm.doc.customer_address, cur_frm.doc.shipping_address_name], true);
        } else {
            if (cur_frm.doc.customer_address) {
                update_address_display(frm, 'address_display', cur_frm.doc.customer_address, false);
            }
            if (cur_frm.doc.shipping_address_name) {
                update_address_display(frm, 'shipping_address', cur_frm.doc.shipping_address_name, false);
            }
        }
        frm.add_custom_button(__("Label Verpackungseinheit"), function() {
            create_label(frm);
        });
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

function reload_contacts(frm) {
    var contact = cur_frm.doc.contact_person;
    cur_frm.set_value("contact_person", "");
    cur_frm.set_value("contact_person", contact);
}

frappe.ui.form.on('Delivery Note Item', {
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

function fetch_taxes_and_charges_from_customer(frm) {
    if(!cur_frm.doc.customer) {
        return;
    }
    frappe.call({
        "method": "frappe.client.get",
        "args": {
            "doctype": "Customer",
            "name": cur_frm.doc.customer
        },
        "callback": function(response) {
            var customer = response.message;

            if (customer.taxes_and_charges) {
                cur_frm.set_value('taxes_and_charges', customer.taxes_and_charges);
            }
        }
    });
}


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

function create_label(frm) {
    var label_printer = "Zebra 57x32"; 
    var contents = get_label_content(frm); 
    frappe.call({
        "method": "senstech.scripts.delivery_note_tools.print_multiple_label_pdf",
        "args": {
            "printer_name": label_printer,
            "contents": contents
        },
        "freeze": true,
        "freeze_message": 'Erstelle Labelserie...',
        "callback": function(response) {
            var msg = response.message;
        }
    });
}

function get_label_content(frm) {
    var items = cur_frm.doc.items;
    var content = [];
    items.forEach(function(entry) {
       if (entry.chargennummer) {
        content.push([entry.item_code, entry.qty, entry.chargennummer]);
       }
    });
    return content
}

function attach_pdf_print(frm) {
    frappe.call({
        "method": "senstech.scripts.tools.add_freeze_pdf_to_dt",
        "args": {
            "dt": cur_frm.doctype,
            "dn": cur_frm.docname,
            "printformat": 'Delivery Note ST'
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

// Warnung anzeigen, wenn einzelne Positionen (ausser Versandkosten) nicht mit einem Sales Order
// verknüpft sind, obwohl grundsätzlich ein verknüpfter Sales Order existiert
function check_item_links(frm) {
    var has_so_link = false;
    var unlinked_pos = -1;
    cur_frm.doc.items.forEach(function(entry) {
       if(entry.against_sales_order) {
           has_so_link = true;
       }
       if(entry.item_group != "Versandkosten" && !entry.against_sales_order) {
           unlinked_pos = entry.position;
       }
    });
    if(has_so_link && unlinked_pos >= 0) {
        if(typeof check_item_links.confirmed_dn == 'undefined' || check_item_links.confirmed_dn != cur_frm.docname) {
            frappe.validated = false;
            frappe.confirm( __("Warnung: Mindestens ein Artikel (Pos. "+unlinked_pos+") ist nicht mit einer Kunden-AB verknüpft. Speichern fortsetzen?"),
            () => {
                // action to perform if Yes is selected
                check_item_links.confirmed_dn = cur_frm.docname;
                cur_frm.save();
            },
            () => {
                // action to perform if No is selected
                frm.scroll_to_field('items');
            });
        }
    }
}