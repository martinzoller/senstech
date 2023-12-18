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
								gate1_clear_review(frm);
								gate1_request(frm);
							}
						});
						frm.add_custom_button(__("Freigabeantrag löschen"), function() {
							check_not_dirty(frm) &&	gate1_withdraw_request(frm);
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
		
		// Abändern von Dokumenten: Antrags- und Reviewdaten löschen, Checkliste belassen
		if(frm.doc.__islocal && frm.doc.gate1_requested_date) {
			gate1_clear_request(frm, false);
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
		else if(frm.doc.items.some(e => ['Entwicklung nach PZ-2000','Kleinaufträge nach PZ-2002'].includes(e.item_group))) {
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
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
});

frappe.ui.form.on('Quotation Item', {
    item_code(frm, cdt, cdn) {
		// Verhindern, dass bei Artikelwechsel die "Marge" des alten zum Preis des neuen Artikels addiert wird
        frappe.model.set_value(cdt, cdn, "margin_rate_or_amount", "0");
    },
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
	return frm.doc.items.some(e => e.item_group == 'Entwicklung nach PZ-2000');
}

function check_not_dirty(frm) {
	if(frm.is_dirty()) {
		frappe.msgprint(__("Bitte das Dokument zuerst speichern."), __("Ungespeicherte Änderungen"));
	}
	return !frm.is_dirty();
}

function gate1_request(frm) {
	doc_preview_dialog(frm, gate1_dialog, __("Schritt 1: Offerte/Pflichtenheft bestätigen"), __("Weiter &gt;"), true);
}

function gate1_clear_review(frm) {
	frm.set_value('gate1_reviewer_comments', '');
	frm.set_value('gate1_review_result', '');
	frm.set_value('gate1_reviewed_by_user', '');
	frm.set_value('gate1_reviewed_by_name', '');
	frm.set_value('gate1_reviewed_date', '');
}

function gate1_withdraw_request(frm){
	frappe.confirm(__("Der Antrag muss danach erneut ausgefüllt werden. Wirklich löschen?"), () => {
		gate1_clear_request(frm, true);
	});
}

function gate1_clear_request(frm, clear_checklist){
	
	// Antragsdaten leeren
	frm.set_value('gate1_requester_comments', '');
	frm.set_value('gate1_requested_by_user', '');
	frm.set_value('gate1_requested_by_name', '');
	frm.set_value('gate1_requested_date', '');
	
	// ggf. vorhandene Review-Daten leeren
	gate1_clear_review(frm);
	
	if(clear_checklist) {
		// Checklistendaten und Kommentare leeren
		// Upload-Felder vorsichtshalber sein lassen		
		frm.set_value('gate1_check_specsheet', '');
		frm.set_value('gate1_check_development_plan', '');
		frm.set_value('gate1_check_risk_management', '');
		frm.set_value('gate1_check_environment', '');
		frm.set_value('gate1_comment_environment', '');
		frm.set_value('gate1_check_procurement', '');
		frm.set_value('gate1_comment_procurement', '');
		frm.set_value('gate1_check_cost_calc', '');
	}
	
	frm.save().then(r => {
		frm.reload_doc();
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
				default: frm.doc.gate1_check_specsheet,				
				fieldtype: 'Select',
				options: ['Ja','Nein'],
				read_only: is_review,				
			},
			{
				label: __('Kostenkalkulation und Angebot erstellt?'),
				fieldname: 'gate1_check_cost_calc',
				default: frm.doc.gate1_check_cost_calc,
				fieldtype: 'Select',
				options: ['Ja','Nein'],
				read_only: is_review,				
			},
			{
				label: __('Kostenkalkulation'),
				fieldname: 'gate1_upload_cost_calc',
				default: upload_field_default(frm.doc.gate1_upload_cost_calc, is_review),
				fieldtype: is_review?'Data':'Attach',
				depends_on: doc => doc.gate1_check_cost_calc == 'Ja',
				read_only: is_review,				
			},
			{
				label: __('Entwicklungsplan erstellt?'),
				fieldname: 'gate1_check_development_plan',
				default: frm.doc.gate1_check_development_plan,
				fieldtype: 'Select',
				options: ['Ja','Nein','Nicht benötigt'],
				read_only: is_review,				
			},
			{
				label: __('Entwicklungsplan'),
				fieldname: 'gate1_upload_development_plan',
				default: upload_field_default(frm.doc.gate1_upload_development_plan, is_review),
				fieldtype: is_review?'Data':'Attach',
				depends_on: doc => doc.gate1_check_development_plan == 'Ja',
				read_only: is_review,				
			},
			{
				label: __('Risikomanagement-Plan erstellt?'),
				description: __('Bei Medizinprodukten nach ISO 13485 obligatorisch'),
				fieldname: 'gate1_check_risk_management',
				default: frm.doc.gate1_check_risk_management,
				fieldtype: 'Select',
				options: ['Ja','Nein','Nicht benötigt'],
				read_only: is_review,				
			},
			{
				label: __('Risikomanagement-Plan'),
				fieldname: 'gate1_upload_risk_management',
				default: upload_field_default(frm.doc.gate1_upload_risk_management, is_review),
				fieldtype: is_review?'Data':'Attach',
				depends_on: doc => doc.gate1_check_risk_management == 'Ja',
				read_only: is_review,
			},
			{
				label: __('Umweltverträglichkeit: Produkt und Herstellprozesse frei von RoHS/REACH gelisteten oder anderweitig problematischen Substanzen?'),
				fieldname: 'gate1_check_environment',
				default: frm.doc.gate1_check_environment,
				fieldtype: 'Select',
				options: ['Ja','Ja, mit Vorbehalt','Nein'],
				read_only: is_review,
			},
			{
				label: __('Kommentar zur Umweltverträglichkeit'),
				description: __('Problematische Substanzen aufführen und Ansatz zu deren gefahrloser Verwendung im spezifischen Anwendungsfall skizzieren'),
				fieldname: 'gate1_comment_environment',
				default: frm.doc.gate1_comment_environment,
				fieldtype: 'Text Editor',
				depends_on: doc => doc.gate1_check_environment == 'Ja, mit Vorbehalt',
				read_only: is_review,
			},
			{
				label: __('Belegdokument zur Umweltverträglichkeit'),
				description: __('Optionaler Beleg für die Diskussion der möglichen Umweltprobleme mit dem Kunden und/oder für die Existenz einer gangbaren Lösung'),
				fieldname: 'gate1_upload_environment',
				default: upload_field_default(frm.doc.gate1_upload_environment, is_review),
				fieldtype: is_review?'Data':'Attach',
				depends_on: doc => doc.gate1_check_environment == 'Ja, mit Vorbehalt',
				read_only: is_review,
			},
			{
				label: __('Alle Rohmaterialien ohne Probleme beschaffbar?'),
				fieldname: 'gate1_check_procurement',
				default: frm.doc.gate1_check_procurement,
				fieldtype: 'Select',
				options: ['Ja','Ja, mit Vorbehalt','Nein'],
				read_only: is_review,
			},
			{
				label: __('Kommentar zur Materialbeschaffung'),
				description: __('Beschaffungsprobleme aufführen und gefundene Lösungen/Alternativen darlegen'),
				fieldname: 'gate1_comment_procurement',
				default: frm.doc.gate1_comment_procurement,
				fieldtype: 'Text Editor',
				depends_on: doc => doc.gate1_check_procurement == 'Ja, mit Vorbehalt',
				read_only: is_review,
			},			
			{
				label: __('Belegdokument zu Beschaffungsproblemen'),
				description: __('Optionaler Beleg für die Diskussion der Beschaffungsprobleme mit dem Kunden und/oder für die Existenz einer gangbaren Lösung'),
				fieldname: 'gate1_upload_procurement',
				default: upload_field_default(frm.doc.gate1_upload_procurement, is_review),
				fieldtype: is_review?'Data':'Attach',
				depends_on: doc => doc.gate1_check_procurement == 'Ja, mit Vorbehalt',
				read_only: is_review
			},			
			{
				label: __('Kommentare und Referenzen zum Freigabeantrag (optional)'),
				fieldname: 'gate1_requester_comments',
				default: frm.doc.gate1_requester_comments,
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
				) && (
					(vals.gate1_check_environment == 'Ja, mit Vorbehalt' && !text_field_empty(vals.gate1_comment_environment)) ||
					vals.gate1_check_environment == 'Ja'
				) && (
					(vals.gate1_check_procurement == 'Ja, mit Vorbehalt' && !text_field_empty(vals.gate1_comment_procurement)) ||
					vals.gate1_check_procurement == 'Ja'
				)
			);
			
			if(!is_checklist_filled) {
				frappe.msgprint(__("Bitte bei allen Feldern der Checkliste eine Option auswählen."),__("Leere Auswahlfelder"));
				return;
			}
			if(!is_review && !is_checklist_complete) {
				frappe.msgprint(__("Für einen Freigabeantrag muss die Dokumentation zur Entwicklungsphase 0 vollständig sein. Vorbehalte bei Umweltverträglichkeit oder Beschaffbarkeit sind zu erläutern und allfällige Lösungsansätze mit Dokumenten zu belegen."),__("Checkliste unvollständig"));
				return;
			} else if(is_review && !is_checklist_complete && vals.gate1_review_result != 'Gate 1 nicht erreicht') {
				frappe.msgprint(__("Wenn die Dokumentation noch lückenhaft ist, bitte das Ergebnis 'Gate 1 nicht erreicht' auswählen."),__("Checkliste unvollständig"));
				return;
			}
			
			gate1_checklist.hide();

			
			// Formulardaten übernehmen
			
			let save_fields = [];
			if(is_review) {
				save_fields = [
					'gate1_reviewed_date',
					'gate1_reviewer_comments',
					'gate1_review_result'
				];
				frm.set_value('gate1_reviewed_by_user', frappe.user.name);
				frm.set_value('gate1_reviewed_by_name', frappe.session.user_fullname);
			} else {
				save_fields = [
					'gate1_check_specsheet',
					'gate1_check_cost_calc',
					'gate1_upload_cost_calc',
					'gate1_check_development_plan',
					'gate1_upload_development_plan',
					'gate1_check_risk_management',
					'gate1_upload_risk_management',
					'gate1_check_environment',
					'gate1_comment_environment',
					'gate1_upload_environment',
					'gate1_check_procurement',
					'gate1_comment_procurement',
					'gate1_upload_procurement',
					'gate1_requested_date',
					'gate1_requester_comments',
				];
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
					'gate1_upload_cost_calc',
					'gate1_upload_environment',
					'gate1_upload_procurement',
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

					if(frm.doc.gate1_reviewed_date) {
						// Nach Review automatisch buchen (unabhängig vom Ergebnis!)
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

function upload_field_default(value, is_review) {
	return is_review?'<a href="'+value+'" target="_blank">'+value+'</a>':value;
}