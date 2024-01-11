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
	if (!frm.doc.taxes_and_charges && frm.doctype != "Request for Quotation") {
		validation_error(frm, 'taxes_and_charges', __("Bitte Vorlage für Steuern und Abgaben hinterlegen"));
	}

	// TODO: Blanket Order doesn't have a position number, but there isn't a good reason why it should not
	if(! ["Blanket Order", "Purchase Receipt"].includes(frm.doctype)) {
		let pos_numbers = [];
		frm.doc.items.forEach(function(entry) {
			if(text_field_empty(entry.description)){
				entry.description = entry.item_name;
			}
			if(pos_numbers.includes(entry.position)) {
				validation_error(frm, 'items', __("Doppelte Positionsnummer:")+" "+entry.position);
			}
			else if(entry.position === 0) {
				validation_error(frm, 'items', __("Positionsnummern müssen grösser Null sein"));
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
	let payment_terms_field = (frm.doctype=='Blanket Order'?'payment_terms':'payment_terms_template');
	if (!frm.doc[payment_terms_field]) {
		validation_error(frm, payment_terms_field, __("Vorlage Zahlungsbedingungen muss ausgewählt werden"));
	}
	
	if(!frm.doc.eori_number && frm.doc.territory != "Schweiz" && ! ["Quotation", "Delivery Note"].includes(frm.doctype)) {
		frappe.db.get_value("Territory", frm.doc.territory, "parent_territory").then(r => {
			if(r.message && r.message.parent_territory == 'Europa') {
				if(frm.doctype == 'Sales Invoice') {
					validation_error(frm, 'customer', __('Im Kundenstamm ist keine EORI-Nummer hinterlegt. Für den Versand an EU-Kunden ist diese zwingend erforderlich.')+'<br><br><a href="#Form/Customer/'+frm.doc.customer+'" target="_blank">&gt; '+__('Zum Kunden:')+' '+frm.doc.customer_name+'</a>');
				} else {
					frappe.show_alert({message: __('Im Kundenstamm ist keine EORI-Nummer hinterlegt. Bitte diese beim Kunden anfordern, damit eine Rechnung erstellt werden kann!')+'<br><br><a href="#Form/Customer/'+frm.doc.customer+'" target="_blank">&gt; '+__('Zum Kunden:')+' '+frm.doc.customer_name+'</a>', indicator: 'orange'}, 30);
				}
			}
		});
	}
	
	let processed_count = 0;
	let found_count = 0;
	let items = frm.doc.items;
	items.forEach(function(entry) {
		if (frm.doctype != 'Quotation' && entry.item_code == 'GP-00003') {
			validation_error(frm, 'items', __("Der generische Nullserie-Artikel GP-00003 darf nur für Offerten verwendet werden. Zum Bestellzeitpunkt ist ein spezifischer Artikel anzulegen. Bevor dieser ausgeliefert wird, muss die Nullserie-Freigabe (Gate 2) vorliegen."))
		}
		if (entry.item_group) {
			processed_count++;
			if (entry.item_group == 'Versandkosten') {
				found_count++;
			}
			if(processed_count == items.length && found_count != 1) {
				validation_error(frm, 'items', __("Bitte genau einmal Versandkosten/Lieferkonditionen hinterlegen"));
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
					validation_error(frm, 'items', __("Bitte genau einmal Versandkosten/Lieferkonditionen hinterlegen"));
				}
			});
		}
	});
	if(!frm.doc.project && frm.doctype != 'Quotation' && frm.doc.items.some(i => i.item_group == 'Entwicklung nach PZ-2000')) {
		validation_error(frm, 'project', __("Allen Verkaufsdokumenten mit Entwicklungspositionen muss ein Projekt zugewiesen sein"));
	}
}


function update_customer_data(frm) {
	frappe.db.get_doc("Customer", frm.doc.customer).then(cust => {
		if(cust && !cust.payment_terms) {
			frappe.db.set_value("Customer", frm.doc.customer, "payment_terms", frm.doc.payment_terms_template).then(r => {
				frappe.show_alert({message: __('Zahlungsbedingungen im Kundenstamm gespeichert:')+' '+frm.doc.payment_terms_template, indicator: 'green'}, 5);
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


function validation_error(frm, field, message) {
	frappe.msgprint(message, __("Validation") );
	if(frappe.validated) {
		frappe.validated = false;
		frm.scroll_to_field(field);
	}
}

function validation_require(frm, field, message) {
	if(!frm.doc[field]) {
		validation_error(frm, field, message);
		return false;
	}
	return true;
}

function doc_preview_dialog(frm, callback, dialog_title = __("Dokumentvorschau"), button_text = __("OK"), fullscreen = false, cancel_callback = false) {
    
    var pdf_uri = 
		'%2Fapi%2Fmethod%2Ffrappe.utils.print_format.download_pdf%3Fdoctype%3D'
		+encodeURIComponent(frm.doctype)
		+'%26name%3D'
		+encodeURIComponent(frm.docname)
		+'%26format%3D'
		+encodeURIComponent(frm.doctype)
		+'%20ST%26no_letterhead%3D0%26_lang%3D'+(frm.doc.language || "de");
    var pdf_preview = new frappe.ui.Dialog({
		title: dialog_title,
		fields: [
			{
			    fieldtype: "HTML",
			    options: '<iframe style="width: 100%;height: calc(100vh - 160px);" src="/assets/senstech/pdfjs/web/viewer.html?file='+pdf_uri+'#zoom=page-fit"></iframe>'
			}
		],
		primary_action_label: button_text,
		primary_action: function() {
		    pdf_preview.hide();
			if(fullscreen) {
				document.exitFullscreen();
			}
			callback(frm);
		},
		secondary_action_label: __("Abbrechen"),
		secondary_action: function() {
			if(fullscreen) {
				document.exitFullscreen();
			}
			cancel_callback && cancel_callback(frm);
		}
	});
	pdf_preview.show();
	let modal_elem = pdf_preview.$wrapper.find(".modal-dialog");
	modal_elem.css("min-width","80%");
	if(fullscreen) {
		// ugly, but if we use $.when(...) to wait until the dialog is showing, the fullscreen request is denied...
		setTimeout(function() {
			modal_elem[0].requestFullscreen();
		}, 500);
	}
}

function project_query(frm) {
	frm.set_query('project', () => {
		return {
			filters: { project_type: 'Extern' }
		};
	});
};

function text_field_empty(val) {
	return !val || val == '<div><br></div>';
}