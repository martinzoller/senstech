frappe.require('/assets/senstech/js/gate_n.js');

frappe.ui.form.on('Quotation', {
	before_save(frm) {
		fetch_templates_from_party(frm);
	},
	party_name(frm) {
		setTimeout(function(){
			fetch_templates_from_party(frm);
		}, 1000);
	},
	currency(frm) {
		assign_price_list_by_currency(frm);
	},
	refresh(frm) {
		if (frm.doc.customer_address && frm.doc.shipping_address_name) {
			update_address_display(frm, ['address_display', 'shipping_address'], [frm.doc.customer_address, frm.doc.shipping_address_name], true);
		} else {
			if (frm.doc.customer_address) {
				update_address_display(frm, 'address_display', frm.doc.customer_address);
			}
			if (frm.doc.shipping_address_name) {
				update_address_display(frm, 'shipping_address', frm.doc.shipping_address_name);
			}
		}
		
		// Bestelloption auch bei abgelaufenen Offerten
		if(frm.doc.docstatus == 1 && !(['Lost', 'Ordered']).includes(frm.doc.status)) {
			if(frm.doc.valid_till && frappe.datetime.get_diff(frm.doc.valid_till, frappe.datetime.get_today()) < 0) {
				frm.add_custom_button(__('Sales Order'), function() {
					frappe.model.open_mapped_doc({
						method: "senstech.scripts.quotation_tools.make_sales_order_ignore_validity",
						frm: frm
					});
				}, __('Create'));
			}
		}
		
		// Offertenfreigabe
		if (!frm.doc.__islocal && frm.doc.docstatus == 0) {
			if(frm.doc.gate1_requested_date) {
				// Dokument schreibgeschützt, sobald Freigabe beantragt
				frm.set_read_only();
				
				// Review bereits abgeschlossen, jedoch Fehler beim Buchen aufgetreten
				if(frm.doc.gate1_reviewed_date) {
					if(frappe.perm.has_perm("Quotation", 1, "write")) {
						frm.add_custom_button(__("Gate-1-Review wiederholen"), function() {
							if(check_not_dirty(frm)) {
								gateN_clear_review(frm, 1);
								gate1_request(frm);
							}
						});
						frm.add_custom_button(__("Freigabeantrag löschen"), function() {
							check_not_dirty(frm) &&	gateN_withdraw_request(frm, 1);
						});
					}
					else {
						frm.add_custom_button(__("Neuerliche Freigabe erfordert höhere Berechtigung."), function() {}, __("Freigabeantrag abgelehnt"));
					}
				}
				
				// Freigabeantrag gestellt
				else {
					if(frappe.perm.has_perm("Quotation", 1, "write") && frm.doc.gate1_requested_by_user != frappe.user.name) {
						frm.add_custom_button(__("Offerte freigeben"), function() {
							check_not_dirty(frm) &&	gate1_request(frm);
						});
					}
					if(frappe.perm.has_perm("Quotation", 0, "write")) {
						frm.add_custom_button(__("Freigabeantrag löschen"), function() {
							check_not_dirty(frm) && gateN_withdraw_request(frm, 1);
						});
					} else {
						frm.add_custom_button(__("Bearbeitung erfordert höhere Berechtigung."), function() {}, __("Freigabeantrag hängig"));
					}
				}
			} else if(doc_has_dev_items(frm) && frappe.perm.has_perm("Quotation", 0, "write")) {
				frm.add_custom_button(__("Freigabe beantragen"), function() {
					check_not_dirty(frm) &&	gate1_request(frm);
				});
			}
		}
		
		// Abändern von Dokumenten: Antrags- und Reviewdaten löschen, Checkliste belassen
		// [NB: Betrifft nur Abändern gebuchter Dokumente, beim Duplizieren werden dank der Option "no_copy" alle Gate-N-Felder geleert]
		if(frm.doc.__islocal && frm.doc.gate1_requested_date) {
			gateN_clear_request(frm, 1, false);
		}
	},
	onload(frm) {
		set_specsheet_queries(frm);
	},	
	onload_post_render(frm) {
		// Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
		jQuery('div[data-fieldname="naming_series"]').hide();
		// "In Worten" auch nicht
		jQuery('div[data-fieldname="base_in_words"]').hide();
	},
	validate(frm) {
		basic_sales_validations(frm);
		
		if(frm.doc.pp_number) {
			if(! new RegExp(`^PP-[0-9]{5}$`).test(frm.doc.pp_number)) {
				validation_error(frm, 'pp_number', __("Die Projektvorschlagsnr. muss dem Schema PP-##### entsprechen."))
			}
		}
		else if(frm.doc.items.some(e => ['GP-00001','GP-00002'].includes(e.item_code))) {
			validation_error(frm, 'pp_number', __("Bei Entwicklungsprojekten und Kleinaufträgen muss eine Projektvorschlagsnummer angegeben werden."))
		}
		
		frm.doc.items.forEach(entry => {
			// Validierung Pflichtenheft bei Entwicklungsprojekten
			if(entry.item_code == 'GP-00001') {
				let pos_prefix = __("Pos. {0}: ",[entry.position]);
				if(
					!entry.specsheet_measurand ||
					!entry.specsheet_range ||
					!entry.specsheet_process_substrate ||
					!entry.specsheet_process_insulation ||
					!entry.specsheet_process_metal_layers ||
					!entry.specsheet_process_protective_layer ||
					!entry.specsheet_process_dicing ||
					!entry.specsheet_process_soldering ||
					!entry.specsheet_process_laser_welding ||
					!entry.specsheet_process_final_testing ||
					!entry.specsheet_process_packaging
				) {
					frappe.msgprint(pos_prefix+__("Das Pflichtenheft für die Entwicklung wurde nicht vollständig ausgefüllt."), __("Validation"));
					frappe.validated = false;
					frm.fields_dict.items.grid.get_row(entry.idx-1).toggle_view(true);
				}
			}
		});
		
		// Falls GP-00001 gefunden wurde, Beschreibungstext abfragen und auch noch validieren
		if(frm.doc.items.some(i => i.item_code == 'GP-00001')) {
			frappe.db.get_value("Item",['item_code','=','GP-00001'],"description").then(r => {
				if(r.message) {
					let default_desc = r.message[1];
					frm.doc.items.forEach(entry => {
						if(entry.item_code == 'GP-00001' && entry.description == default_desc) {
							let pos_prefix = __("Pos. {0}: ",[entry.position]);
							frappe.msgprint(pos_prefix+__("Der Beschreibungstext ist Teil des Pflichtenhefts und muss ausgefüllt bzw. angepasst werden."), __("Validation"));
							frappe.validated = false;
							frm.fields_dict.items.grid.get_row(entry.idx-1).toggle_view(true);
						}
					});
				}
			});
		}
		
		reload_contacts(frm);
	},
	before_submit(frm) {
		if(!frm.doc.gate1_reviewed_date){
			if(doc_has_dev_items(frm)) {
				validation_error(frm, 'bemerkung_intern', __("Offerten mit Entwicklungsdienstleistungen benötigen eine Freigabe. Bitte zuerst einen Freigabeantrag stellen."))
			}
		}
		frm.doc.submitted_by = frappe.user.name;
	},
	on_submit(frm) {
		// ggf. Dialog zum Aktualisieren von Listenpreisen anzeigen
		update_list_prices(frm);
	},
	after_cancel(frm) {
		add_cancelled_watermark(frm);
	}
});

function gate1_request(frm) {
	doc_preview_dialog(frm, () => { gateN_dialog(frm, 1); }, __("Schritt 1: Offerte/Pflichtenheft bestätigen"), __("Weiter &gt;"), true);
}


frappe.ui.form.on('Quotation Item', {
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
   }
});

handle_custom_uom_fields('Quotation');


function fetch_templates_from_party(frm) {
    if(!frm.doc.party_name) {
        return;
    }
    frappe.call({
        "method": "frappe.client.get",
        "args": {
            "doctype": frm.doc.quotation_to,
            "name": frm.doc.party_name
        },
        "callback": function(response) {
            var customer = response.message;

            if (!frm.doc.taxes_and_charges && customer.taxes_and_charges) {
                frm.set_value('taxes_and_charges', customer.taxes_and_charges);
            }
            if(!frm.doc.payment_terms_template && customer.payment_terms){
                frm.set_value('payment_terms_template', customer.payment_terms);
            }
        }
    });
}

function set_specsheet_queries(frm) {
	frm.set_query("specsheet_process_substrate", "items", function() {
		return{
			filters: {'processing_step': 'Substratherstellung'}
		}
	});
	frm.set_query("specsheet_process_insulation", "items", function() {
		return{
			filters: {'processing_step': 'Isolationsschicht'}
		}
	});
	frm.set_query("specsheet_process_metal_layers", "items", function() {
		return{
			filters: {'processing_step': 'Metallschichten'}
		}
	});
	frm.set_query("specsheet_process_laser_ablation", "items", function() {
		return{
			filters: {'processing_step': 'Laserablation'}
		}
	});
	frm.set_query("specsheet_process_protective_layer", "items", function() {
		return{
			filters: {'processing_step': 'Schutzschicht'}
		}
	});
	frm.set_query("specsheet_process_dicing", "items", function() {
		return{
			filters: {'processing_step': 'Vereinzeln'}
		}
	});
	frm.set_query("specsheet_process_soldering", "items", function() {
		return{
			filters: {'processing_step': 'Löten'}
		}
	});
	frm.set_query("specsheet_process_laser_welding", "items", function() {
		return{
			filters: {'processing_step': 'Laserschweissen'}
		}
	});
	frm.set_query("specsheet_process_final_testing", "items", function() {
		return{
			filters: {'processing_step': 'Endkontrolle'}
		}
	});
	frm.set_query("specsheet_process_packaging", "items", function() {
		return{
			filters: {'processing_step': 'Verpackung'}
		}
	});
}

function doc_has_dev_items(frm) {
	return frm.doc.items.some(e => e.item_code == 'GP-00001');
}