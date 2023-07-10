/*
 * common_st.js: Functions used in several doctype specific scripts
 */
 
 function set_position_number(frm, cdt, cdn) {
	let current_item = locals[cdt][cdn];
	let all_items = frm.doc.items;
	let row_count = all_items.length;
	let pos_step; let prev_idx;
	if (row_count == current_item.idx) {
		pos_step = 10;
	} else {
		pos_step = 1;
	}
	let new_pos = pos_step;
	if (current_item.idx != 1) {
		prev_idx = current_item.idx - 1;
		all_items.forEach(function(entry) {
			if (entry.idx == prev_idx) {
				new_pos = parseInt(entry.position) + pos_step;
			}
		});
	}
	frappe.model.set_value(cdt, cdn, 'position', new_pos);
}

function add_cancelled_watermark(frm) {
    frappe.call({
        "method": "senstech.scripts.tools.add_cancelled_watermark",
        "args": {
            "dt": frm.doctype,
            "dn": frm.docname
        },
        "callback": function(response) {
            frm.reload_doc();
        }
    });
}

function attach_pdf_print(frm) {
    frappe.call({
        "method": "senstech.scripts.tools.add_freeze_pdf_to_dt",
        "args": {
            "dt": frm.doctype,
            "dn": frm.docname,
            "printformat": 'Sales Order ST'
        },
        "callback": function(response) {
            frm.reload_doc();
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
            "doctype": frm.doctype,
            "doc_name": frm.docname,
            "fields": fields,
            "addresses": addresses,
            'as_list': as_list
        },
        "callback": function(response) {
            var response = response.message;
            if (!as_list) {
                if (response == 'updated') {
                    frm.reload_doc();
                }
            } else {
				if (response.includes('updated')) {
                    frm.reload_doc();
                }
            }
        }
    });
}

function basic_common_validations(frm) {
	if (!frm.doc.taxes_and_charges) {
		validation_error('taxes_and_charges', __("Bitte Vorlage für Verkaufssteuern und -abgaben hinterlegen"));
	}

	// TODO: Blanket Order doesn't have a position number, but there isn't a good reason why it should not
	if(! ["Blanket Order", "Purchase Receipt"].includes(frm.doctype)) {
		let pos_numbers = [];
		frm.doc.items.forEach(function(entry) {
			if(!entry.description || entry.description == '<div><br></div>'){
				entry.description = entry.item_name;
			}
			if(pos_numbers.includes(entry.position)) {
				validation_error('items', __("Doppelte Positionsnummer:")+" "+entry.position);
			}
			else if(entry.position === 0) {
				validation_error('items', __("Positionsnummern müssen grösser Null sein"));
			}
			pos_numbers.push(entry.position);   
		});
	}
}


function basic_purchasing_validations(frm) {
	basic_common_validations(frm);
}


function basic_sales_validations(frm) {
	basic_common_validations(frm);
	if (!frm.doc.payment_terms_template) {
		validation_error('payment_terms_template', __("Vorlage Zahlungsbedingungen muss ausgewählt werden"));
	}
	
	if(! ["Quotation", "Delivery Note"].includes(frm.doctype)) {
		if(!frm.doc.eori_number) {
			validation_error('customer', __('Im Kundenstamm ist keine EORI-Nummer hinterlegt')+'<br><br><a href="#Form/Customer/'+frm.doc.customer+'" target="_blank">&gt; '+__('Zum Kunden:')+' '+frm.doc.customer_name+'</a>');
		}
	}
	
	let processed_count = 0;
	let found_count = 0;
	let items = frm.doc.items;
	items.forEach(function(entry) {
		if (entry.item_group) {
			processed_count++;
			if (entry.item_group == 'Versandkosten') {
				found_count++;
			}
			if(processed_count == items.length && found_count != 1) {
				validation_error('items', __("Bitte genau einmal Versandkosten/Lieferkonditionen hinterlegen"));
			}
		}
		else {
			// Documents with "local" items (no item group available): Fetch item group from server
			// This is to avoid validation errors when creating a Sales Order from a Blanket Order
			frappe.db.get_value('Item',entry.item_code,'item_group').then(r => {
				processed_count++;
				if (r.message && r.message.item_group == 'Versandkosten') {
					found_count++;
				}
				if(processed_count == items.length && found_count != 1) {
					validation_error('items', __("Bitte genau einmal Versandkosten/Lieferkonditionen hinterlegen"));
				}
			});
		}
	});
}


function fetch_taxes_and_charges_from_supplier(frm) {
	if(!frm.doc.supplier) {
		return;
	}
	frappe.call({
		"method": "frappe.client.get",
		"args": {
			"doctype": "Supplier",
			"name": frm.doc.supplier
		},
		"callback": function(response) {
			var supplier = response.message;

			if (supplier.taxes_and_charges) {
				frm.set_value('taxes_and_charges', supplier.taxes_and_charges);
			}
		}
	});
}


function reload_contacts(frm) {
	var contact = frm.doc.contact_person;
	frm.set_value("contact_person", "");
	frm.set_value("contact_person", contact);
}


function validation_error(field, message) {
	frappe.msgprint(message, __("Validation") );
	if(frappe.validated) {
		frappe.validated = false;
		frm.scroll_to_field(field);
	}
}