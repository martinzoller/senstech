frappe.ui.form.on('Sales Order', {
    before_save(frm) {
	    fetch_templates_from_customer(frm);
	},
    customer(frm) {
        setTimeout(function(){
            fetch_templates_from_customer(frm);
        }, 1000);
    },
    validate(frm) {
		if (!frm.doc.payment_terms_template) {
	        frappe.msgprint(__("Vorlage Zahlungsbedingungen muss ausgewählt werden"), __("Validation"));
	        frappe.validated=false;
	        frm.scroll_to_field('payment_terms_template');
		}
		if (!frm.doc.taxes_and_charges) {
	        frappe.msgprint( __("Bitte Vorlage für Verkaufssteuern und -abgaben hinterlegen"), __("Validation") );
            frappe.validated=false;
	        frm.scroll_to_field('taxes_and_charges');
	    }
        var count = 0;
        var items = cur_frm.doc.items;
        items.forEach(function(entry) {
            if (entry.item_group == 'Versandkosten') {
                count = count + 1;
            } 
        });
        if (count != 1) {
            frappe.msgprint( __("Bitte genau einmal Versandkosten hinterlegen"), __("Validation") );
            frappe.validated=false;
        }
        reload_contacts(frm);
    },
    after_save(frm) {
        calculate_versanddatum(frm);
    },
    refresh(frm) {
        if (cur_frm.doc.customer_address && cur_frm.doc.shipping_address_name) {
            update_address_display(frm, ['address_display', 'shipping_address'], [cur_frm.doc.customer_address, cur_frm.doc.shipping_address_name], true);
        } else {
            if (cur_frm.doc.customer_address) {
                update_address_display(frm, 'address_display', cur_frm.doc.customer_address);
            }
            if (cur_frm.doc.shipping_address_name) {
                update_address_display(frm, 'shipping_address', cur_frm.doc.shipping_address_name);
            }
        }
        setTimeout(function(){
            // Lieferdatum kürzer darstellen
            reformat_delivery_dates();
        }, 1000);
        if(cur_frm.doc.__islocal) {
            // ggf. Kundendaten abrufen
            if (!cur_frm.doc.taxes_and_charges || !cur_frm.doc.payment_terms_template){
                setTimeout(function(){
                    fetch_templates_from_customer(frm);
                }, 1000);
            }
            // ggf. Position der 1. Zeile korrekt setzen (Bugfix, offenbar wird diese Zeile neu automatisch erzeugt?)
            if(cur_frm.doc.items) {
                if(cur_frm.doc.items[0].position == 0) {
                    frappe.model.set_value(cur_frm.doc.items[0].doctype,cur_frm.doc.items[0].name,'position',10);
                }
            }
        }
    },
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
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


frappe.ui.form.on('Sales Order Item', {
    item_code: function(frm, cdt, cdn) {
        var current_item = locals[cdt][cdn];
        setTimeout(function(){
            if(current_item.blanket_order) {
                fetch_templates_from_blanket_order(frm, current_item.blanket_order);
            }
        }, 1000);
    },
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


function calculate_versanddatum(frm) {
    frappe.call({
        "method": "senstech.scripts.sales_order_tools.calculate_versanddatum",
        "args": {
            "so": cur_frm.doc.name
        },
        "callback": function(response) {
            if (response.message == 'updated') {
                cur_frm.reload_doc();
            }
        }
    });
}


function fetch_templates_from_customer(frm) {
	if(!cur_frm.doc.customer) {
        return;
    }

    frappe.db.get_doc("Customer", cur_frm.doc.customer).then(customer => {
        if(customer) {
    		if (!cur_frm.doc.taxes_and_charges && customer.taxes_and_charges) {
    				cur_frm.set_value('taxes_and_charges', customer.taxes_and_charges);
    		}
    		if(!cur_frm.doc.payment_terms_template && customer.payment_terms){
    				cur_frm.set_value('payment_terms_template', customer.payment_terms);
    		}
        }
    });
}


function fetch_templates_from_blanket_order(frm, blanket_order) {
    console.log('BOfetch');

    frappe.db.get_doc("Blanket Order", blanket_order).then(bo => {
        if(bo) {
    		if(bo.taxes_and_charges) {
    				cur_frm.set_value('taxes_and_charges', bo.taxes_and_charges);
    		}
    		if(bo.payment_terms) {
    				cur_frm.set_value('payment_terms_template', bo.payment_terms);
    		}
        }
    });
}


function reload_contacts(frm) {
    var contact = cur_frm.doc.contact_person;
    cur_frm.set_value("contact_person", "");
    cur_frm.set_value("contact_person", contact);
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

function attach_pdf_print(frm) {
    frappe.call({
        "method": "senstech.scripts.tools.add_freeze_pdf_to_dt",
        "args": {
            "dt": cur_frm.doctype,
            "dn": cur_frm.docname,
            "printformat": 'Sales Order ST'
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


function reformat_delivery_dates() {
    $('div[data-fieldname="delivery_date"] > .static-area:visible').each(function(index){
        var date4 = $(this).text();
        if (date4.match(/^\d{2}.\d{2}.\d{4}$/)) {
            $(this).text(date4.substr(0,6)+date4.substr(8,2));
        }
    });
}