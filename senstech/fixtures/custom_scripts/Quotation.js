frappe.ui.form.on('Quotation', {
    before_save(frm) {
		fetch_templates_from_party(frm);
	},
    party_name(frm) {
        setTimeout(function(){
            fetch_templates_from_party(frm);
        }, 1000);
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
		
		set_specsheet_queries(frm);
		
		if (!frm.doc.__islocal && frm.doc.docstatus == 0) {
			if(frm.doc.gate1_requested_date) {
				// Dokument schreibgeschützt, sobald Freigabe beantragt
				frm.set_read_only();
				
				// Review bereits abgeschlossen (vermutlich negativ, sonst wäre docstatus>1)
				if(frm.doc.gate1_reviewed_date) {
					if(frappe.perm.has_perm("Quotation", 1, "write")) {
						frm.add_custom_button(__("Gate-1-Review wiederholen"), function() {
							if(check_not_dirty(frm)) {
								gate1_clear_review(frm);
								gate1_request(frm);
							}
						});
						frm.add_custom_button(__("Freigabeantrag löschen"), function() {
							check_not_dirty(frm) &&	gate1_withdraw_request(frm, true);
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
							check_not_dirty(frm) && gate1_withdraw_request(frm);
						});
					} else {
						frm.add_custom_button(__("Bearbeitung erfordert höhere Berechtigung."), function() {}, __("Freigabeantrag hängig"));
					}
				}
			} else if(doc_has_dev_items(frm) && frappe.perm.has_perm("Quotation", 0, "write")) {
				frm.add_custom_button(__("Freigabe beantragen"), function() {
					gate1_request(frm);
				});
			}
		}
    },
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    validate(frm) {
		basic_sales_validations(frm);
		
		if(! new RegExp(`^PP-[0-9]{5}$`).test(frm.doc.pp_number)) {
			validation_error(frm, 'pp_number', __("Die Projektvorschlagsnr. muss dem Schema PP-##### entsprechen."))
		}
		
		let gp00001_found = false;
		frm.doc.items.forEach(entry => {
			// Validierung Pflichtenheft bei Entwicklungsprojekten
			if(entry.item_code == 'GP-00001') {
				gp00001_found = true;
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
		if(gp00001_found) {
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
		if(frm.doc.gate1_review_result != "Gate 1 erreicht" || !frm.doc.gate1_reviewed_date){
			if(doc_has_dev_items(frm)) {
				validation_error(frm, 'bemerkung_intern', __("Offerten mit Entwicklungsdienstleistungen benötigen eine Freigabe. Bitte zuerst einen Freigabeantrag stellen."))
			}
		}
        frm.doc.submitted_by = frappe.user.name;
    },
    on_submit(frm) {
		if(frm.doc.gate1_reviewed_date) {
			attach_pdf_with_gate1(frm);
		} else {
			attach_pdf_print(frm);
		}
    },
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
});

frappe.ui.form.on('Quotation Item', {
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
   }
});


function fetch_templates_from_party(frm) {
    if(!cur_frm.doc.party_name) {
        return;
    }
    frappe.call({
        "method": "frappe.client.get",
        "args": {
            "doctype": cur_frm.doc.quotation_to,
            "name": cur_frm.doc.party_name
        },
        "callback": function(response) {
            var customer = response.message;

            if (!cur_frm.doc.taxes_and_charges && customer.taxes_and_charges) {
                cur_frm.set_value('taxes_and_charges', customer.taxes_and_charges);
            }
            if(!cur_frm.doc.payment_terms_template && customer.payment_terms){
                cur_frm.set_value('payment_terms_template', customer.payment_terms);
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
	return frm.doc.items.some(e => e.item_group == 'Dienstleistungen Entwicklung');
}

function check_not_dirty(frm) {
	if(frm.is_dirty()) {
		frappe.msgprint(__("Bitte das Dokument zuerst speichern."), __("Ungespeicherte Änderungen"));
	}
	return !frm.is_dirty();
}

function gate1_request(frm) {
	doc_preview_dialog(frm, gate1_dialog, __("Schritt 1: Offerte/Pflichtenheft bestätigen"), __("Weiter &gt;"));
}

function gate1_clear_review(frm) {
	frm.set_value('gate1_reviewer_comments', '');
	frm.set_value('gate1_review_result', '');
	frm.set_value('gate1_reviewed_by_user', '');
	frm.set_value('gate1_reviewed_by_name', '');
	frm.set_value('gate1_reviewed_date', '');
}

function gate1_withdraw_request(frm, clear_review=false){
	frappe.confirm(__("Der Antrag muss danach erneut ausgefüllt werden. Wirklich löschen?"), () => {
		// Checklistendaten leeren
		// Upload-Felder vorsichtshalber sein lassen
		frm.set_value('gate1_check_specsheet', '');
		frm.set_value('gate1_check_development_plan', '');
		frm.set_value('gate1_check_risk_management', '');
		frm.set_value('gate1_check_environment', '');
		frm.set_value('gate1_check_procurement', '');
		frm.set_value('gate1_check_cost_calc', '');
		
		// Antragsdaten leeren
		frm.set_value('gate1_requester_comments', '');
		frm.set_value('gate1_requested_by_user', '');
		frm.set_value('gate1_requested_by_name', '');
		frm.set_value('gate1_requested_date', '');
		
		// ggf. Review-Daten leeren
		if(clear_review) {
			gate1_clear_review(frm);
		}
			   
		frm.save().then(r => {
			frm.reload_doc();
		});
	});
}

function gate1_dialog(frm) {
	let action_text = __("Freigabe beantragen");
	let is_review = Boolean(frm.doc.gate1_requested_date);
	let requester_uid = frappe.user.name;
	let requester_name = frappe.session.user_fullname;
	let requested_date = 'Today';
	if(is_review) {
		action_text = __("Review abschliessen");
		requester_uid = frm.doc.gate1_requested_by_user;
		requester_name = frm.doc.gate1_requested_by_name;
		requested_date = frm.doc.gate1_requested_date;
	}
	let gate1_checklist = new frappe.ui.Dialog({
		title: __("Schritt 2: Checkliste Gate 1"),
		fields: [
			{
				label: __('Lastenheft erstellt und mit Kunde abgeglichen?'),
				fieldname: 'gate1_check_specsheet',
				fieldtype: 'Select',
				options: ['Ja','Nein'],
			},
			{
				label: __('Kostenkalkulation und Angebot erstellt?'),
				fieldname: 'gate1_check_cost_calc',
				default: frm.doc.gate1_upload_cost_calc?'Ja':'',
				fieldtype: 'Select',
				options: ['Ja','Nein'],
			},
			{
				label: __('Kostenkalkulation'),
				fieldname: 'gate1_upload_cost_calc',
				default: frm.doc.gate1_upload_cost_calc,
				fieldtype: 'Attach',
				depends_on: doc => doc.gate1_check_cost_calc == 'Ja',
			},
			{
				label: __('Entwicklungsplan erstellt?'),
				fieldname: 'gate1_check_development_plan',
				/* Bei Review nur dann "abhäkeln", wenn Datei bereits vorhanden */
				/* (ansonsten soll Reviewer den Bedarf unabhängig beurteilen) */
				default: frm.doc.gate1_upload_development_plan?'Ja':'',
				fieldtype: 'Select',
				options: ['Ja','Nein','Nicht benötigt'],
			},
			{
				label: __('Entwicklungsplan'),
				fieldname: 'gate1_upload_development_plan',
				default: frm.doc.gate1_upload_development_plan,
				fieldtype: 'Attach',
				depends_on: doc => doc.gate1_check_development_plan == 'Ja',
			},
			{
				label: __('Risikomanagement-Plan erstellt?'),
				fieldname: 'gate1_check_risk_management',
				default: frm.doc.gate1_upload_risk_management?'Ja':'',
				fieldtype: 'Select',
				options: ['Ja','Nein','Nicht benötigt'],
			},
			{
				label: __('Risikomanagement-Plan'),
				fieldname: 'gate1_upload_risk_management',
				default: frm.doc.gate1_upload_risk_management,
				fieldtype: 'Attach',
				depends_on: doc => doc.gate1_check_risk_management == 'Ja',
			},
			{
				label: __('Umweltverträglichkeit unproblematisch?'),
				fieldname: 'gate1_check_environment',
				fieldtype: 'Select',
				options: ['Ja','Nein'],
			},
			{
				label: __('Materialbeschaffung unproblematisch?'),
				fieldname: 'gate1_check_procurement',
				fieldtype: 'Select',
				options: ['Ja','Nein'],
			},
			{
				label: __('Kommentare und Referenzen zum Freigabeantrag (optional)'),
				fieldname: 'gate1_requester_comments',
				fieldtype: 'Text Editor',
				read_only: is_review,
			},
			{
				label: __('Freigabe beantragt durch'),
				fieldname: 'gate1_requested_by_name',
				fieldtype: 'Data',
				default: requester_name,
				read_only: '1'
			},
			{
				label: __('Freigabe beantragt am'),
				fieldname: 'gate1_requested_date',
				fieldtype: 'Date',
				default: requested_date,
				read_only: '1',
			},
			{
				label: __('Review-Ergebnis'),
				fieldname: 'gate1_review_result',
				fieldtype: 'Select',
				options: ['Gate 1 erreicht','Gate 1 nicht erreicht'],
				depends_on: f => is_review
			},
			{
				label: __('Kommentare und Referenzen zum Review (optional)'),
				description: __('<b>Hinweis:</b> Eine Freigabe mit Vorbehalten ist nicht vorgesehen. Bei unvollständiger Dokumentation ist der Freigabeantrag zwingend abzulehnen.'),
				fieldname: 'gate1_reviewer_comments',
				fieldtype: 'Text Editor',
				depends_on: f => is_review
			},
			{
				label: __('Review durchgeführt durch'),
				fieldname: 'gate1_reviewed_by_name',
				fieldtype: 'Data',
				default: frappe.session.user_fullname,
				read_only: '1',
				depends_on: f => is_review
			},
			{
				label: __('Review durchgeführt am'),
				fieldname: 'gate1_reviewed_date',
				fieldtype: 'Date',
				default: 'Today',
				read_only: '1',
				depends_on: f => is_review
			},
		],
		primary_action_label: action_text,
		primary_action(values) {
			let vals = gate1_checklist.get_values();
			let is_checklist_filled = (
				vals.gate1_check_specsheet &&
				vals.gate1_check_cost_calc &&
				vals.gate1_check_development_plan &&
				vals.gate1_check_risk_management &&
				vals.gate1_check_environment &&
				vals.gate1_check_procurement &&
				(!is_review || vals.gate1_review_result)
			);
			let is_checklist_complete = (
				vals.gate1_check_specsheet == 'Ja' &&
				vals.gate1_check_cost_calc == 'Ja' &&
				vals.gate1_upload_cost_calc && (
					(vals.gate1_check_development_plan == 'Ja' && vals.gate1_upload_development_plan) ||
					vals.gate1_check_development_plan == 'Nicht benötigt'
				) && (
					(vals.gate1_check_risk_management == 'Ja' && vals.gate1_upload_risk_management) ||
					vals.gate1_check_risk_management == 'Nicht benötigt'
				) &&
				vals.gate1_check_environment == 'Ja' &&
				vals.gate1_check_procurement == 'Ja'
			);
			
			if(!is_checklist_filled) {
				frappe.msgprint(__("Bitte bei allen Feldern der Checkliste eine Option auswählen."),__("Leere Auswahlfelder"));
				return;
			}
			if(!is_review && !is_checklist_complete) {
				frappe.msgprint(__("Für einen Freigabeantrag muss die Dokumentation zur Entwicklungsphase 0 vollständig sein. Eine Freigabe mit Vorbehalten ist nicht vorgesehen."),__("Checkliste unvollständig"));
				return;
			} else if(is_review && !is_checklist_complete && vals.gate1_review_result != 'Gate 1 nicht erreicht') {
				frappe.msgprint(__("Wenn die Dokumentation noch lückenhaft ist, bitte das Ergebnis 'Gate 1 nicht erreicht' auswählen."),__("Checkliste unvollständig"));
				return;
			}
			
			gate1_checklist.hide();

			
			// Formulardaten übernehmen
			let save_fields = [
				'gate1_check_specsheet',
				'gate1_check_development_plan',
				'gate1_upload_development_plan',
				'gate1_check_risk_management',
				'gate1_upload_risk_management',
				'gate1_check_environment',
				'gate1_check_procurement',
				'gate1_check_cost_calc',
				'gate1_upload_cost_calc'
			];
			
			if(is_review) {
				save_fields.push('gate1_reviewed_date');
				save_fields.push('gate1_reviewer_comments');
				save_fields.push('gate1_review_result');
				frm.set_value('gate1_reviewed_by_user', frappe.user.name);
				frm.set_value('gate1_reviewed_by_name', frappe.session.user_fullname);
			} else {
				save_fields.push('gate1_requested_date');
				save_fields.push('gate1_requester_comments');
				frm.set_value('gate1_requested_by_user', frappe.user.name);
				frm.set_value('gate1_requested_by_name', frappe.session.user_fullname);
			}
			
			save_fields.forEach(function(field_name) {
				frm.set_value(field_name, vals[field_name]);
			});		

			// Speichern
			frm.save().then(r => {

				// Attachments direkt an die Offerte hängen für einfacheren Zugriff
				let attach_fields = [
					'gate1_upload_development_plan',
					'gate1_upload_risk_management',
					'gate1_upload_cost_calc'
				];
				attach_fields = attach_fields.filter(fld => vals[fld]);
				
				let attach_done = [];
				attach_fields.forEach(function(field_name) {
					let p = new Promise((resolve,reject) => {
						frappe.call({
							"method": "senstech.scripts.tools.attach_file_to_document",
							"args": {
								"file_url": vals[field_name],
								"doctype": "Quotation",
								"docname": frm.docname,
								"field": field_name
							},
							"callback": function(response) {
								if(!response) {
									frappe.show_alert({message: __("Fehler beim Anhängen der Datei an die Offerte: {0}", [vals[field_name]]), indicator: 'red'}, 10);
								}
								resolve();
							}
						});
					});
					attach_done.push(p);
				});

				// Erst fortfahren, wenn alle Attachments angehängt wurden
				Promise.all(attach_done).then(f => {
					frm.reload_doc();

					if(frm.doc.gate1_review_result == "Gate 1 erreicht" && frm.doc.gate1_reviewed_date) {
						// Automatisch buchen
						frappe.validated = true;
						frm.script_manager.trigger("before_submit").then(function() {
							if(frappe.validated) {
								cur_frm.save('Submit', function(r) {
									if(!r.exc) {
										cur_frm.script_manager.trigger("on_submit");
									}
								});
							}
						});
					}
				});
			});
		},
		secondary_action_label: __("Abbrechen")
	});
	gate1_checklist.show();

}

function attach_pdf_with_gate1(frm) {
    frappe.call({
        "method": "senstech.scripts.tools.add_freeze_pdf_to_dt",
        "args": {
            "dt": frm.doctype,
            "dn": frm.docname,
            "printformat": 'Gate 1 Checklist ST',
			"filename": frm.docname+'-Gate1.pdf'
        },
        "callback": function(response) {
            attach_pdf_print(frm);
        }
    });
}