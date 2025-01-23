/*
 * gate_n.js: Functions used for "Gate 1/2/3" clearance in Quotation and Item doctypes
 */


// Helper für Gate-Freigaben
function check_not_dirty(frm) {
	if(frm.is_dirty()) {
		frappe.msgprint(__("Bitte das Dokument zuerst speichern."), __("Ungespeicherte Änderungen"));
	}
	return !frm.is_dirty();
}


// Formularfelder für Gate-Freigabe aus Doctype-Definition lesen
function gateN_field_list(frm, N) {
	return frm.fields.filter(f =>
		f.df.fieldname &&
		f.df.fieldname.startsWith('gate'+N+'_') && 
		!['Section Break','Column Break'].includes(f.df.fieldtype) &&
		f.df.fieldname != 'gate'+N+'_clearance_log'
	);
}

// Review-Felder leeren
function gateN_clear_review(frm, N) {
	let review_fields = gateN_field_list(frm, N).filter(f => f.df.fieldname.startsWith('gate'+N+'_review'));
	gateN_clear_fields(frm, review_fields);
}


// Gate-Freigaben: Freigabeantrag zurückziehen
function gateN_withdraw_request(frm, N){
	frappe.confirm(__("Der Antrag muss danach erneut ausgefüllt werden. Wirklich löschen?"), () => {
		gateN_clear_request(frm, N , true);
	});
}

// Gate-Freigaben: Freigabeantrag löschen (mit oder ohne Checkliste)
function gateN_clear_request(frm, N, clear_checklist){
	
	let gate_fields = gateN_field_list(frm, N);
	
	if(clear_checklist) {
		// Alles ausser Upload-Felder leeren
		// (diese der Einfachheit halber sein lassen; die Dateien komplett zu löschen wäre recht aufwändig [TODO])
		let all_fields = gate_fields.filter(f => !f.df.fieldname.includes('_upload_'));
		gateN_clear_fields(frm, all_fields);
	}
	else {
		// Nur Antrags- und Review-Daten leeren
		let request_fields = gate_fields.filter(f => f.df.fieldname.startsWith('gate'+N+'_request'))
		gateN_clear_fields(frm, request_fields);
		gateN_clear_review(frm, N);
	}
	
	frm.save().then(r => {
		frm.reload_doc();
	});
}


// Gate-Freigaben: Felder gemäss Liste leeren (Helper)
function gateN_clear_fields(frm, fields) {
	fields.forEach(field => {
		frm.set_value(field.df.fieldname, '');
	});
}


// Gate-Freigabeformular: Helper für Upload-Felder
function upload_field_default(value, is_review) {
	return is_review?'<a href="'+value+'" target="_blank">'+value+'</a>':value;
}



// Feld für einfacheren Zugriff auf Freigabestatus von Artikeln (Gate 2/3) - wird bei jedem Gate-Review aktualisiert
function set_gate_clearance_status(frm) {
	let status = 0;
	if(frm.doc.gate2_review_result == "Gate 2 erreicht"){
		if(frm.doc.gate3_review_result == "Gate 3 erreicht und Produktionsfreigabe erteilt"){
			status = 3;
		} else {
			status = 2;
		}
	}
	frm.set_value("gate_clearance_status", status);
}


// Gate-Freigaben: Dialog zeigen und verarbeiten
function gateN_dialog(frm, N) {
	let action_text = __("Freigabe beantragen");
	let is_review = Boolean(frm.doc['gate'+N+'_requested_date']);
	let metadata = {
		requested_by_user: frappe.user.name,
		requested_by_name: frappe.session.user_fullname,
		requested_date: 'Today',
	};
	if(is_review) {
		// TODO - Hier nochmals prüfen - in Sonderfällen bleibt der Button "Freigabeantrag" nach Speichern sichtbar und löst dann direkt die Freigabe aus ?!
		if(!frappe.perm.has_perm(frm.doctype, 1, "write") || frm.doc['gate'+N+'_requested_by_user'] == frappe.user.name) {
			frappe.msgprint(__("Freigabe muss durch anderen Nutzer als der Antrag erfolgen und dieser muss entsprechende Berechtigung haben"),__("Zugriff verweigert"));
			return;
		}
		action_text = __("Review abschliessen");
		metadata = {
			requested_by_user: frm.doc['gate'+N+'_requested_by_user'],
			requested_by_name: frm.doc['gate'+N+'_requested_by_name'],
			requested_date: frm.doc['gate'+N+'_requested_date'],
			reviewed_by_user: frappe.user.name,
			reviewed_by_name: frappe.session.user_fullname,
			reviewed_date: 'Today',
		};
	}
	
	// Dialogspezifikation erzeugen (weitgehend aus Felddefinitionen abgeleitet)
	let dialog_fields = gateN_field_list(frm, N);
	let dialog_field_specs = [
		{
			/* Artikelgruppe: Benötigt für 'depends_on' Anzeigeregeln anderer Felder */
			fieldname: 'item_group',
			default: frm.doc.item_group,
			fieldtype: 'Data',
			hidden: true,
			read_only: true,
		}
	];
	let dialog_spec_ready = [];
	for(var i=0; i<dialog_fields.length; i++) {
		let df = dialog_fields[i].df;
		let shortname = df.fieldname.substr(6);
		let field_spec = {
			label: __(df.label),
			description: __(df.description),
			fieldname: df.fieldname,
			default: frm.doc[df.fieldname],
			fieldtype: df.fieldtype,
			depends_on: df.depends_on,
			options: df.options,
			read_only: is_review,
		};

		// Select-Feld: Leere Option weglassen mittels trim()
		if(df.fieldtype == "Select") {
			field_spec.options = df.options.trim().split("\n");
			// Sonderfall Gate3 AV/Stückliste: Option "gegenüber Nullserie unverändert" wird nur bei Indexerhöhung dargestellt
			if(df.fieldname == 'gate3_check_prod_documents' && frm.doc.prev_revision_clearance_status != 3) {
				field_spec.options = ['Ja','Nein'];
			}
		}
		// Upload-Feld
		else if(df.fieldtype == "Attach") {
			field_spec.default = upload_field_default(frm.doc[df.fieldname], is_review);
			field_spec.fieldtype = is_review ? 'Data' : 'Attach';
		}
		// Fetch-Feld (Data-Feld mit autom. Abfrage / read-only)
		else if(df.fieldname.includes('_fetch_')) {
			// Felder werden bereits durch aufrufende Funktion in Item.js gesetzt
			// => schreibschützen und zugehöriges Check-Feld ggf. noch setzen
			if(df.fieldname != 'gate2_fetch_pilot_series_order' || field_spec.default) {
				// Ausnahme Nullserie-AB, soll man manuell wählen können wenn keine gefunden.
				field_spec.read_only = true;
				field_spec.fieldtype = 'Data'; // Link-Feld mit Schreibschutz stellt keine Werte dar, daher Data-Feld verwenden
			}
			if(field_spec.default){
				let check_field = dialog_field_specs.find(f => f.fieldname == df.fieldname.replace('_fetch_','_check_'));
				check_field.default = 'Ja';
			}
		}
		// Link-Feld
		else if(df.fieldtype == 'Link') {
			// Bei read-only den Typ auf "Data" setzen, da sonst der Wert nicht sichtbar ist
			if(is_review){
				field_spec.fieldtype = "Data";
			} else {
				// Feldspezifische Query-Funktionen setzen (nicht via Doctype-Def. möglich)
				if(df.fieldname == 'gate2_link_prototypes') {
					let proj = frm.doc.project || 'EP-999-00'; // Keine Chargen anzeigen, wenn kein Projekt zugewiesen
					field_spec.get_query = function() {
						return {
							filters: {
								'chargennummer': ['LIKE', proj.replaceAll('-','')+'%']
							}
						};
					};
				}
			}
		}
		// Sonderfall, da Int-Feld, aber im Dialog als Select-Feld darzustellen
		else if(df.fieldname == 'gate2_max_pilot_batches') {
			field_spec.fieldtype = 'Select';
			field_spec.options = ['1','2','3'];
		}
		
		// Antrags-/Review-Felder
		if(shortname.startsWith('review') && !is_review) {
			continue;
		}
		else if(shortname.startsWith('request') || shortname.startsWith('review')){
			field_spec.default = metadata[shortname];
			field_spec.read_only = true;
			if(shortname.endsWith('by_user')){
				field_spec.hidden = true; // Benutzer-ID nicht im Dialog zeigen
			}
			else if(shortname == 'requester_comments') {
				field_spec.read_only = is_review;
			}
			else if(shortname == 'reviewer_comments') {
				field_spec.read_only = false;
			}
			else if(shortname == 'review_result') {
				delete field_spec.default; // Review-Ergebnis immer explizit wählen lassen
				field_spec.read_only = false;
			}
		}
		
		dialog_field_specs.push(field_spec);
	}
	
	let gateN_checklist = new frappe.ui.Dialog({
		title: __("Checkliste Gate {0}", [N]),
		fields: dialog_field_specs,
		primary_action_label: action_text,
		primary_action(values) {
			let vals = gateN_checklist.get_values();
			let empty_select_fields = dialog_fields.filter(
				f => f.df.fieldtype == "Select" && 
				!vals[f.df.fieldname] &&
				(is_review || f.df.fieldname != 'gate'+N+'_review_result') /* Review-Ergebnis darf bei Freigabeantrag noch leer sein */
			);
			if(empty_select_fields.length > 0) {
				frappe.msgprint(__("Bitte bei allen Feldern der Checkliste eine Option auswählen."),__("Leere Auswahlfelder"));
				return;
			}
			
			let is_checklist_complete = true;
			let waiting_for = [];
			let keep_dialog_open = false;
			for(var i=0; i<dialog_fields.length; i++) {
				let df = dialog_fields[i].df;
				let val = vals[df.fieldname];
				if(df.fieldname.includes('_check_')){
					let upload_field = df.fieldname.replace('_check_', '_upload_');
					let link_field = df.fieldname.replace('_check_', '_link_');
					if(frm.fields_dict[upload_field]) {
						// Assoziiertes Upload-Feld leer, nur zulässig wenn Option 'Nicht benötigt' gewählt, oder bei Belegdokument zu Vorbehalt
						if(!vals[upload_field] && val != 'Nicht benötigt' && val != 'Ja; Unterlagen gegenüber Nullserie unverändert' && !df.options.includes("Ja, mit Vorbehalt")) {
							is_checklist_complete = false;
							break;
						}
					}
					if(frm.fields_dict[upload_field+'2']) {
						// ggf. zweites Upload-Feld
						if(!vals[upload_field+'2'] && val != 'Nicht benötigt' && val != 'Ja; Unterlagen gegenüber Nullserie unverändert') {
							is_checklist_complete = false;
							break;
						}
					}
					if(frm.fields_dict[link_field]) {
						// Assoziiertes Link-Feld leer, nur zulässig wenn Option 'Nicht benötigt' verfügbar und gewählt
						if(!vals[link_field] && val != 'Nicht benötigt') {
							is_checklist_complete = false;
							break;
						}
						
						/*if(df.fieldname == 'gate2_check_pilot_series_order') {
							let p = frappe.db.get_doc("Sales Order", vals[link_field]).then(sales_order => {
								if(!sales_order.items.some(f => f.item_code == 'GP-00003')) {
									frappe.msgprint(__("Die gewählte Kunden-AB enthält keinen Nullserieartikel GP-00003."),__("Ungültige Auswahl"));
									keep_dialog_open = true;
								}
							});
							waiting_for.push(p);
						}*/
					}
					if(val == 'Ja, mit Vorbehalt') {
						// Vorbehalt benötigt mindestens einen Kommentar als Doku
						let comment_field = df.fieldname.replace('_check_', '_comment_');
						if(text_field_empty(vals[comment_field])) {
							is_checklist_complete = false;
							break;
						}
					}
					else if(!['Ja','Nicht benötigt','Ja; Unterlagen gegenüber Nullserie unverändert'].includes(val)){
						// Nein oder ungültige Antwort
						is_checklist_complete = false;
						break;
					}
				}
				else if(df.fieldname.includes('_fetch_')){
					// "Fetch"-Felder werden unabhängig von den "Check"-Feldern überprüft
					if(!val) {
						is_checklist_complete = false;
						break;
					}
				}
			}
			
			if(!is_review && !is_checklist_complete) {
				frappe.msgprint(__("Für einen Freigabeantrag muss die Dokumentation zur Entwicklungsphase {0} vollständig sein. Vorbehalte sind zu erläutern und allfällige Lösungsansätze mit Dokumenten zu belegen.", [N-1]),__("Checkliste unvollständig"));
				return;
			} else if(is_review && !is_checklist_complete && vals["gate"+N+"_review_result"] != "Gate "+N+" nicht erreicht") {
				frappe.msgprint(__("Wenn die Dokumentation noch lückenhaft ist, bitte das Ergebnis 'Gate {0} nicht erreicht' auswählen.", [N]),__("Checkliste unvollständig"));
				return;
			}
			
			// Dialog erst schliessen, wenn ggf. asynchrone Validierungen abgeschlossen sind
			Promise.all(waiting_for).then(() => {
				if(keep_dialog_open) {
					return;
				}
				
				gateN_checklist.hide();

			
				// Formulardaten übernehmen
				let save_fields = [];
				if(is_review) {
					save_fields = dialog_fields.map(f => f.df.fieldname).filter(f => f.startsWith('gate'+N+'_review'));
				} else {
					save_fields = dialog_fields.map(f => f.df.fieldname).filter(f => !f.startsWith('gate'+N+'_review'));
				}
				
				save_fields.forEach(function(field_name) {
					frm.set_value(field_name, vals[field_name]);
				});
				
				let gateN_log = frm.doc['gate'+N+'_clearance_log'] || '';
				if(is_review) {
					set_gate_clearance_status(frm);
					gateN_log += "\n" + frappe.datetime.get_today() + ": Review abgeschlossen durch "+frm.doc['gate'+N+'_reviewed_by_name']+" mit Ergebnis '" + frm.doc['gate'+N+'_review_result'] + "'";
				} else {
					gateN_log += "\n" + frappe.datetime.get_today() + ": Freigabeantrag gestellt durch "+frm.doc['gate'+N+'_requested_by_name'];
					
				}
				frm.set_value('gate'+N+'_clearance_log', gateN_log);

				// Speichern
				frm.save().then(r => {

					// Attachments direkt an Dokument hängen für einfacheren Zugriff
					let attach_fields = dialog_fields.map(f => f.df.fieldname).filter(f => f.includes('_upload_'));
					attach_fields = attach_fields.filter(fld => vals[fld]);
					
					let attach_done = [];
					attach_fields.forEach(function(field_name) {
						let p = new Promise((resolve,reject) => {
							frappe.call({
								"method": "senstech.scripts.tools.attach_file_to_document",
								"args": {
									"file_url": vals[field_name],
									"doctype": frm.doctype,
									"docname": frm.docname,
									"field": field_name
								},
								"callback": function(response) {
									if(!response) {
										frappe.show_alert({message: __("Fehler beim Anhängen der Datei an das Dokument: {0}", [vals[field_name]]), indicator: 'red'}, 10);
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

						if(frm.doc['gate'+N+'_reviewed_date'] && N==1) {
							// Gate 1: Offerte nach Review automatisch buchen (unabhängig vom Ergebnis!)
							frappe.validated = true;
							frm.script_manager.trigger("before_submit").then(function() {
								if(frappe.validated) {
									frm.save('Submit', function(r) {
										if(!r.exc) {
											frm.script_manager.trigger("on_submit");
										}
									});
								}
							});
						}
					});
				});
			});
		},
		secondary_action_label: __("Abbrechen")
	});
	
	Promise.all(dialog_spec_ready).then(() => {
		gateN_checklist.show();
	});
}