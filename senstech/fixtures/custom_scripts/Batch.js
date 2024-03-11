var histo_batch = '';

frappe.ui.form.on('Batch', {
	validate(frm) {
	    if (frm.doc.__islocal) {
			var item = frm.doc.item;
			var chargennummer = frm.doc.chargennummer.trim();
			var batch_id = item + "-" + chargennummer;
			frm.set_value('chargennummer', chargennummer);
			frm.set_value('batch_id', batch_id);
			
			if(frm.doc.batch_type == 'Serieprodukt') {
				frappe.db.get_value('Item',item,'has_sub_batches').then(r => {
					if(!r.message) {
						validation_error(frm, 'item', __("Fehler beim Laden des Basisartikels"));
						return;
					}
					var hat_teilchargen = r.message.has_sub_batches;	            
					const schema_basis = /^[0-9]{2}\/[0-9]{2}$/;
					const schema_teilcharge = /^[0-9]{2}\/[0-9]{2}[A-Z]+$/;

					if(hat_teilchargen && !schema_teilcharge.test(chargennummer)) {
						validation_error(frm, 'chargennummer', __("Bitte eine gültige Chargennummer mit Teilcharge nach Schema 'NN/YYX[X]' angeben"));
						return;
					}
					else if(!hat_teilchargen && !schema_basis.test(chargennummer)) {
						validation_error(frm, 'chargennummer', __("Bitte eine gültige Chargennummer nach Schema 'NN/YY' angeben"));
						return;
					}
					
					var bezeichnung = chargennummer + " - " + frm.doc.item_name;
					frm.set_value('bezeichnung', bezeichnung);
				});
				
			} else if(frm.doc.batch_type == 'Entwicklung') {
				var project = frm.doc.project;
				frappe.db.get_value('Project',project,'mountain_name').then(r => {
					if(!r.message) {
						validation_error(frm, 'project', __("Fehler beim Laden des Projektnamens"));
						return;
					}
					const schema_dev = /^EP[0-9]{5}[A-Z]+$/;
					if(!schema_dev.test(chargennummer)) {
						validation_error(frm, 'chargennummer', __("Bitte eine gültige Chargennummer nach Schema 'EPkkknnX[X]' angeben"));
						return;
					}
					if(chargennummer.substr(2,3) != project.substr(3,3) || chargennummer.substr(5,2) != project.substr(7,2)) {
						validation_error(frm, 'chargennummer', __("Die Kunden- und Projektnummer muss mit dem gewählten Projekt übereinstimmen"));
						return;
					}
					var bezeichnung = chargennummer + " - Prototypen «" + r.message.mountain_name + "»";
					frm.set_value('bezeichnung', bezeichnung);
				});
				
			} else if(frm.doc.batch_type == 'Kleinauftrag') {
				var sales_order = frm.doc.sales_order;
				frappe.db.get_value('Sales Order',sales_order,'customer_name').then(r => {
					if(!r.message) {
						validation_error(frm, 'sales_order', __("Fehler beim Laden des Kundennamens"));
						return;
					}
					const schema_k = /^SO[0-9]{5}[A-Z]+$/;
					if(!schema_k.test(chargennummer)) {
						validation_error(frm, 'chargennummer', __("Bitte eine gültige Chargennummer nach Schema 'SO#####X[X]' angeben"));
						return;
					}
					if(chargennummer.substr(2,5) != sales_order.substr(3,5)) {
						validation_error(frm, 'chargennummer', __("Die AB-Nummer muss mit dem gewählten Auftrag übereinstimmen"));
						return;
					}
					var bezeichnung = chargennummer + " - Kleinauftrag für " + r.message.customer_name;
					frm.set_value('bezeichnung', bezeichnung);
				});
			}
		}
	},
	refresh(frm) {
		/* Charge freigegeben oder Freigabe beantragt: Fast alles schreibgeschützt */
		if(frm.doc.freigabe_beantragt_durch || frm.doc.freigabedatum) {
			frm.set_df_property('messdaten_nullpunkt','read_only',1);
			frm.set_df_property('messdaten_last','read_only',1);
		}
		else {
			frm.set_df_property('messdaten_nullpunkt','read_only',0);
			frm.set_df_property('messdaten_last','read_only',0);
		}
		
		if(frm.is_new()) {
			frm.set_df_property('item','read_only',0);
			frm.set_df_property('chargennummer','read_only',0);
		}
		else {
			frm.set_df_property('item','read_only',1);
			frm.set_df_property('chargennummer','read_only',1);
		}
		/* Benötigt, damit Abschnitt "Messdaten" immer erscheint, wenn er bearbeitbar ist */
		frm.layout.refresh_sections();

		/* Prod.charge gespeichert: Div. Operationen mit Buttons möglich, Histogramme sichtbar */
		if(!frm.is_new()) {
            
			/*
		    frm.add_custom_button(__("QR-Labels erzeugen"), function() {
				qr_labels(frm);
			});*/
			frm.remove_custom_button(__("View Ledger"));
			frm.add_custom_button(__("Lagerbuchungen anzeigen"), function() {
                frappe.route_options = {
					batch_no: frm.doc.name,
					from_date: "1900-01-01"
				};
				frappe.set_route("query-report", "Lagerbuch Produktionscharge MZ");
			});
			frm.add_custom_button(__("Chargenetikett drucken"), function() {
				batch_label(frm);
			})
			
			frm.set_df_property('section_break_x','hidden',0);
		    
			frappe.call({
				method: 'senstech.scripts.tools.check_for_batch_quick_stock_entry',
				args: {
				    item: frm.doc.item,
					batch_no: frm.doc.name,
					warehouse: 'Fertigerzeugnisse - ST'
				},
				callback: (r) => {
				    //var entry_qty = r.message.entry_qty;
				    var freigabe_noetig = r.message.benoetigt_chargenfreigabe;
				    var freigabe_erlaubt = frm.get_perm(1, 'write');
				    
				    if(frm.doc.batch_completed && !freigabe_noetig) {
				        frm.add_custom_button(__("Produktionscharge ist abgeschlossen"), function() {}, __("Keine Einbuchung möglich"));
						frm.add_custom_button(__("Aus Lager entnehmen"), function() {
							aus_lager_entnehmen(frm);
						});
                        frm.add_custom_button(__("Charge wiedereröffnen"), function() {
                            charge_wiedereroeffnen(frm);
                        });
				    }
				    else {
    				    if(freigabe_noetig && !frm.doc.freigabedatum) {
    				        if(frm.doc.freigabe_beantragt_durch) {
								var button_shown = false;
    				            if(freigabe_erlaubt) {
									button_shown = true;
        	                        frm.add_custom_button(__("(Teil-)Charge freigeben"), function() {
        	                            charge_freigeben(frm);
        	                        });
        						}
								if(frm.doc.freigabe_beantragt_durch == frappe.session.user_fullname) {
									button_shown = true;
									frm.add_custom_button(__("Freigabeantrag zurücknehmen"), function() {
										freigabeantrag_zurueck(frm);
									});
								}
								// Wenn weder Freigabe noch Rücknahme des Antrages möglich ist, wird der Klarheit halber ein "Pseudobutton" dargestellt
        						if(!button_shown) {
    						        frm.add_custom_button(__("Chargenfreigabe hängig"), function() {}, __("Keine Lagerbuchung möglich"));
        						}
    				        }
    						else {
    	                        frm.add_custom_button(__("Chargenfreigabe beantragen"), function() {
        	                            freigabeantrag(frm);
    	                        });    
    						}
    				    }
    				    else {
    				        if(frm.doc.freigabedatum && freigabe_erlaubt) {
    				            frm.add_custom_button(__("Chargenfreigabe aufheben"), function() {
    				              chargenfreigabe_aufheben(frm);  
    				            })
    				        }
    					    else if(!freigabe_noetig) {
        						frm.add_custom_button(__("An Lager legen"), function() {
        							an_lager_legen(frm);
        						});
    					    }
							frm.add_custom_button(__("Aus Lager entnehmen"), function() {
								aus_lager_entnehmen(frm);
							});
							if(!freigabe_noetig) {
								frm.add_custom_button(__("Charge abschliessen"), function() {
									charge_abschliessen(frm);
								});
							}
    					}
				    }
				}
			});
			show_histograms(frm);
			//show_prod_details(frm);
			frm.set_df_property('production_details','options', 'Produktions- und Ausschussdetails werden derzeit überarbeitet und sind nicht verfügbar.');
		}
		else {
			// Neues Dokument: ggf. Daten der zuvor geöffneten Charge ausblenden
			frm.set_df_property('production_details','options', ' ');
			frm.set_df_property('histogramm_grafik','options', ' ');
			frm.set_df_property('section_break_x','hidden',1);
		}
	},
	batch_type(frm) {
		if(frm.doc.__islocal) {
			frm.fields_dict.chargennummer.set_value('');
			frm.fields_dict.item_name.set_value('');
			frm.fields_dict.project.set_value('');
			frm.fields_dict.sales_order.set_value('');
			if(frm.doc.batch_type == 'Kleinauftrag') {
				frm.fields_dict.item.set_value('GP-00002');
			}
			else if(frm.doc.batch_type == 'Entwicklung') {
				frm.fields_dict.item.set_value('GP-00001');
			}
			else {
				frm.fields_dict.item.set_value('');
			}
		}
	},
	item(frm) {
		auto_chargennr(frm);
	},
	project(frm) {
		auto_chargennr(frm);
	},
	sales_order(frm) {
		auto_chargennr(frm);
	},
    messdaten_nullpunkt(frm) {
        if(frm.doc.messdaten_nullpunkt) {
            get_histogram_data(frm);
        }
    },
    messdaten_last(frm) {
        if(frm.doc.messdaten_last) {
            get_histogram_data(frm);
        }
    }
})

function an_lager_legen(frm) {
    
	var d = new frappe.ui.Dialog({
		'fields': [
			{'fieldname': 'qty', 'fieldtype': 'Float', 'reqd': 1, 'label': __('Stückzahl'), 'default': 0.000},
			{'fieldname': 'item', 'fieldtype': 'Link', 'options': 'Item', 'default': frm.doc.item, 'read_only': 1, 'label': __('Artikel')},
			{'fieldname': 'batch', 'fieldtype': 'Data', 'default': frm.doc.chargennummer, 'read_only': 1, 'label': __('Chargennummer')}
		],
		primary_action: function(){
			d.hide();
			batch_quick_stock_entry(frm, d.get_values().qty);
		},
		primary_action_label: __('An Lager legen')
	});
	
	d.show();
}

function aus_lager_entnehmen(frm) {
    
	var d = new frappe.ui.Dialog({
		fields: [
			{'fieldname': 'break0', 'fieldtype': 'Section Break', 'description': __('Diese Funktion ist <b>nur</b> für den internen Verbrauch (Entwicklung, nachträglicher Ausschuss etc.) von Artikeln gedacht. Für alle Artikel, die zu einem Kunden gelangen, ist ein Lieferschein auszustellen!')},
			{'fieldname': 'qty', 'fieldtype': 'Float', 'reqd': 1, 'label': __('Stückzahl'), 'default': 1.000},
			{'fieldname': 'comment', 'fieldtype': 'Data', 'reqd': 1, 'label': __('Verwendungszweck')},
			{'fieldname': 'user', 'fieldtype': 'Link', 'options': 'Item', 'default': frappe.user.full_name(), 'read_only': 1, 'label': __('Entnommen durch')},
			{'fieldname': 'item', 'fieldtype': 'Link', 'options': 'Item', 'default': frm.doc.item, 'read_only': 1, 'label': __('Artikel')},
			{'fieldname': 'batch', 'fieldtype': 'Data', 'default': frm.doc.chargennummer, 'read_only': 1, 'label': __('Chargennummer')},
			
		],
		primary_action: function(){
			d.hide();
			var val = d.get_values();
			frappe.call({
				method: 'frappe.desk.form.save.savedocs',
				args: {
					doc: {
						'doctype': 'Stock Entry',
						'stock_entry_type': "Material Issue",
						'from_warehouse': "Fertigerzeugnisse - ST",
						'bemerkung_intern': val.comment,
						'items': [{
							'item_code': frm.doc.item,
							'qty': val.qty,
							'batch_no': frm.doc.name
						}]
					},
					action: 'Submit'
				}
			}).then (f => {
				frm.refresh();
			});
		},
		primary_action_label: __('Aus Lager entnehmen')
	});
	
	d.show();
}


function batch_quick_stock_entry(frm, qty, auto_close=false) {
	frappe.call({
		method: 'senstech.scripts.batch_tools.batch_quick_stock_entry',
		args: {
			batch_no: frm.doc.name,
			warehouse: 'Fertigerzeugnisse - ST',
			item: frm.doc.item,
			qty: qty
		},
		callback: (r) => {
			if(r.message) {
				if(auto_close) {
					charge_abschliessen(frm); // (reload_doc erfolgt im Anschluss)
				}
				else {
					frm.reload_doc();
					var close_prompt = new frappe.ui.Dialog({
						title: __("Lagerbuchung erfolgreich"),
						fields: [
							{
								fieldtype: "HTML",
								options: '<p class="frappe-confirm-message">'+__("Falls dies die letzte Lagerbuchung war, kann die Charge nun abgeschlossen werden.")+'</p>'
							}
						],
						primary_action_label: __("Charge abschliessen"),
						primary_action: function() {
							charge_abschliessen(frm);
							close_prompt.hide();
						},
						secondary_action_label: __("Charge offen lassen")
					});
					close_prompt.show();
				}
			}
		}
	});
}


function get_histogram_data(frm) {
	frappe.call({
		method: 'senstech.scripts.batch_tools.get_histogramm_data',
		args: {
			item: frm.doc.item,
            batch: frm.doc.name,
            messdaten_nullpunkt: frm.doc.messdaten_nullpunkt,
            messdaten_last: frm.doc.messdaten_last
		},
		callback: (r) => {
			if(r.message) {
				frm.reload_doc();
			}
		}
	});
}


function show_histograms(frm) {
	
	if(frm.doc.histogramm_anz_gemessene > 0) {
    	var histogramm = '<div>';
    	var data = JSON.parse(frm.doc.histogramm_daten);
        for (var i=0; i < data.length; i++) {
            histogramm += '<img style="width:49%" src="https://data.libracore.ch/server-side-charts/api/histogram.php?'+data[i]+'">';
        }
        histogramm += '</div>';
        frm.set_df_property('histogramm_grafik','options', histogramm);
    				
	} else {
		if(frm.doc.messdaten_nullpunkt || frm.doc.messdaten_last) {
			frm.set_df_property('histogramm_grafik','options', '<div>Messdaten ungültig</div>');
			// Save docname in a global variable to prevent a reload loop
			if(window.last_reloaded_doc != frm.docname) {
				window.last_reloaded_doc = frm.docname;
				get_histogram_data(frm);
			}
		}
		else {
			frm.set_df_property('histogramm_grafik','options', '<div>Keine Messdaten vorhanden</div>');
		}
	}
}


function show_prod_details(frm) {
    frappe.call({
				method: 'senstech.scripts.batch_tools.get_batch_production_details',
				args: {
				    batch: frm.doc.name,
				},
				callback: (r) => {
				    if(r.message != 'None') {
    				    var details = r.message;
    				    var ausschuss_erw = (details.reject > 0 ? frm.doc.stueckzahl - details.expected_qty+' ('+details.reject+'%)' : 'unbekannt');
    				    var ausschuss_real = ''
    				    if(details.completed) {
    				        ausschuss_real = frm.doc.stueckzahl - details.entered_qty;
    				        ausschuss_real = ausschuss_real + ' (' + Math.ceil(ausschuss_real*100/frm.doc.stueckzahl) + '%)';
    				    }
    				    var infosection = `<table class="infotable">
    				                       <tr><th>Stückzahl</th><th>Voraussichtlich</th><th>Tatsächlich</th></tr>
    				                       <tr><td>Bei Chargeneröffnung</td><td></td><td>`+frm.doc.stueckzahl+`</td></tr>
    				                       <tr><td>Ausschuss</td><td>`+ausschuss_erw+`</td><td>`+ausschuss_real+`</td></tr>
    				                       <tr><td>Fertig gestellt</td><td>`+details.expected_qty+`</td><td>`+details.entered_qty+`</td></tr>`;
    				    if(details.completed) {
    				        infosection += '</table>';
    				    } else {
    				        infosection = 'Produktionscharge voraussichtlich abgeschlossen am: '+details.completion+infosection+`
    				                       <tr><td></td><td></td><td></td></tr><tr><td>Verbleibend</td><td>`+details.projected_remaining_mfg_qty+`</td><td></td></tr></table>`;
    				    }
    				    frm.set_df_property('production_details','options', infosection);
    				    // Chargenfreigabe nicht aufhebbar, wenn schon Sensoren im Lager
    				    if(details.entered_qty > 0) {
    				        if(frm.custom_buttons['Chargenfreigabe aufheben']){
    				            frm.custom_buttons['Chargenfreigabe aufheben'].remove();
    				        }
    				    }
				    } else {
				        frm.set_df_property('production_details','options', 'Fehler beim Laden der Produktionsdetails');
				    }
				}
    });
				
}


function charge_abschliessen(frm) {
    frappe.db.set_value(frm.doctype,frm.docname,'batch_completed','1').then(r => {
        frm.reload_doc();
    });
}


function charge_wiedereroeffnen(frm) {
    frappe.db.set_value(frm.doctype,frm.docname,'batch_completed','0').then(r => {
        frm.reload_doc();
    });
}


function freigabeantrag(frm) {
    if(frm.is_dirty()) {
        frappe.msgprint("Produktionscharge wurde geändert, bitte zuerst speichern oder neu laden");
        return;
    }
    
    frappe.db.get_doc('Item', frm.doc.item).then(item => {
    
        if(item) {
            
            var short_description = item.description.split("</div><div>")[0].replace("<div>", "");
        
          	var antrag = new frappe.ui.Dialog({
        		title: __("Chargenfreigabe beantragen"),
        		fields: [
					{
                        label: 'Stückzahl',
                        fieldname: 'stueckzahl',
                        fieldtype: 'Data',
                        description: 'Stückzahl für die Lagerbuchung.'
                    },
                    {
                        label: 'Herstelldatum',
                        fieldname: 'manufacturing_date',
                        fieldtype: 'Date',
                        default: 'Today',
                        description: 'Herstelldatum für das COC.'
                    },
                    {
                        label: 'Produktverantwortliche/r',
                        fieldname: 'freigabe_beantragt_durch',
                        fieldtype: 'Data',
                        default: frappe.session.user_fullname,
                        description: 'Erscheint mit Unterschrift auf COC.',
                        read_only: '1'
                    }
        		],
        		primary_action_label: __("Freigabe beantragen"),
        		primary_action(values) {
        		    antrag.hide();
        
                    // Artikelstammdaten setzen (werden schon für die Histo-Vorschau bei der Freigabe benötigt)
                    frm.set_value('artikelcode', item.item_code);
                    frm.set_value('artikelbezeichnung', item.item_name);
                    frm.set_value('artikelcode_kunde', item.artikelcode_kunde);
                    frm.set_value('produktrevision_kunde', item.produktrevision_kunde);
                    frm.set_value('qualitaetsspezifikation', item.qualitaetsspezifikation);
                    frm.set_value('short_description',short_description);
                    
                    // Antragsdaten setzen
					frm.set_value('stueckzahl', values.stueckzahl);
                    frm.set_value('manufacturing_date', values.manufacturing_date);
                    frm.set_value('freigabe_beantragt_durch', values.freigabe_beantragt_durch);
                           
                    frm.save().then(r => {
                        frm.reload_doc();
                    });
        		},
        		secondary_action_label: __("Abbrechen")
        	});
        	antrag.show();
        }
        else {
            frappe.msgprint("Fehler: Stammartikel nicht gefunden");
            return;
        }
    });
}


function freigabeantrag_zurueck(frm) {
	// Artikelstammdaten leeren
	frm.set_value('artikelcode', '');
	frm.set_value('artikelbezeichnung', '');
	frm.set_value('artikelcode_kunde', '');
	frm.set_value('produktrevision_kunde', '');
	frm.set_value('qualitaetsspezifikation', '');
	frm.set_value('short_description', '');
	
	// Antragsdaten leeren
	frm.set_value('stueckzahl', '');
	frm.set_value('manufacturing_date', '');
	frm.set_value('freigabe_beantragt_durch', '');
		   
	frm.save().then(r => {
		frm.reload_doc();
	});
}

function charge_freigeben(frm) {
    if(frm.is_dirty()) {
        frappe.msgprint("Produktionscharge wurde geändert, bitte zuerst speichern oder neu laden");
        return;
    }
    
    if(frm.doc.freigabe_beantragt_durch == '' || frm.doc.herstelldatum == '') {
        frappe.msgprint("Ohne Freigabeantrag ist keine Chargenfreigabe möglich");
        return;        
    }
    
    if(frm.doc.freigabe_beantragt_durch == frappe.session.user_fullname) {
        frappe.confirm('Dieselbe Person agiert als Produktverantwortlicher und als freigebender Produktbetreuer. Auf dem COC erscheint zweimal dieselbe Unterschrift. Wirklich fortfahren?', () => { charge_freigeben_schritt1(frm); });
    } else {
        charge_freigeben_schritt1(frm);
    }
}

function charge_freigeben_schritt1(frm) {    
    if(text_field_empty(frm.doc.histogramm_text)) {
        // Kein Histogramm zum Freigeben
        charge_freigeben_schritt2(frm, 'Produktionscharge freigeben');
        return;
    }
    
    if(frm.doc.histogramm_anz_gemessene == 0) {
        frappe.msgprint("Dieses Produkt hat ein Histogramm, jedoch liegen keine Messdaten vor. Chargenfreigabe nicht möglich!");
        return;    
    }
	
	doc_preview_dialog(frm, frm => charge_freigeben_schritt2(frm, 'Schritt 2: Chargendetails bestätigen'), __("Schritt 1: Histogramm freigeben"), __("Histogramm freigeben &gt;"));
}

function charge_freigeben_schritt2(frm, step_title) {
            
    var artikelcode_rev = frm.doc.artikelcode_kunde;
    if(frm.doc.produktrevision_kunde)
      artikelcode_rev += ' rev. '+frm.doc.produktrevision_kunde;
    
    var d = new frappe.ui.Dialog({
        title: step_title,
        fields: [
            {
                label: 'Artikelcode',
                fieldname: 'artikelcode',
                fieldtype: 'Data',
                default: frm.doc.artikelcode,
                read_only: '1'
            },
            {
                label: 'Artikelbezeichnung',
                fieldname: 'item_name',
                fieldtype: 'Data',
                default: frm.doc.artikelbezeichnung,
                read_only: '1'
            },
            {
                fieldname: 'break0',
                fieldtype: 'Column Break',
            },
            {
                label: 'Artikelcode (+Rev.) Kunde',
                fieldname: 'artikelcode_kunde',
                fieldtype: 'Data',
                default: artikelcode_rev,
                read_only: '1'
            },
            {
                label: 'Kurzbeschreibung',
                fieldname: 'short_description',
                fieldtype: 'Data',
                default: frm.doc.short_description,
                read_only: '1'
            },
            {
                fieldname: 'break1',
                fieldtype: 'Section Break',
            },
            {
                label: 'Qualitätsspezifikation',
                fieldname: 'qualitaetsspezifikation',
                fieldtype: 'Text Editor',
                default: frm.doc.qualitaetsspezifikation,
                read_only: '1'
            },
            {
                label: 'Bemerkungen',
                fieldname: 'description',
                fieldtype: 'Small Text',
                description: 'Bei Unregelmässigkeiten in der Produktion auszufüllen. Erscheint auf COC unter "Bemerkungen".'
            },
            {
                fieldname: 'break2',
                fieldtype: 'Section Break',
            },
			{
				label: 'Stückzahl',
				fieldname: 'stueckzahl',
				default: frm.doc.stueckzahl,
				fieldtype: 'Data',
				description: 'Stückzahl für die Lagerbuchung.',
				read_only: '1'
			},
            {
                label: 'Herstelldatum',
                fieldname: 'manufacturing_date',
                fieldtype: 'Date',
                default: frm.doc.manufacturing_date,
                description: 'Für das COC. Wird vom Produktverantwortlichen im Freigabeantrag festgelegt.',
                read_only: '1'
            },
            {
                label: 'Produktverantwortliche/r',
                fieldname: 'freigabe_beantragt_durch',
                fieldtype: 'Data',
                default: frm.doc.freigabe_beantragt_durch,
                read_only: '1'
            },
            {
                fieldname: 'break3',
                fieldtype: 'Column Break',
            },
            {
                label: 'Freigabedatum',
                fieldname: 'freigabedatum',
                fieldtype: 'Date',
                default: 'Today'
            },
            {
                label: 'Freigegeben durch',
                fieldname: 'freigegeben_durch',
                fieldtype: 'Data',
                default: frappe.session.user_fullname,
                read_only: '1'
            }
        ],
        primary_action_label: 'Charge freigeben',
        primary_action(values) {
            d.hide();
            
            // Freigabedaten setzen
            frm.set_value('description', values.description);
            frm.set_value('freigabedatum', values.freigabedatum);
            frm.set_value('freigegeben_durch', values.freigegeben_durch);
                   
		    // Speichern und Lagerbuchung durchführen
            frm.save().then(r => {
                batch_quick_stock_entry(frm, frm.doc.stueckzahl, true);
            });
        }
    });
    
    d.show();
}


function chargenfreigabe_aufheben(frm) {
    if(frm.is_dirty()) {
        frappe.msgprint("Produktionscharge wurde geändert, bitte zuerst speichern oder neu laden");
        return;
    }    
    
    frappe.confirm('Freigabe der Produktionscharge wirklich aufheben?', () => { 
        frm.set_value('freigabedatum', '');
        frm.set_value('freigegeben_durch', '');
               
        frm.save().then(r => {
            frm.reload_doc();
        });
    });
}


// Funktion für QR-Code Labels auf Etikettenbogen A4 (aktuell nicht in Gebrauch)
function qr_labels(frm) {
	var d = new frappe.ui.Dialog({
		'fields': [
			{'fieldname': 'from_no', 'fieldtype': 'Int', 'label': __('Von Sensornummer'), 'default': 1},
			{'fieldname': 'to_no', 'fieldtype': 'Int', 'label': __('Bis Sensornummer'), 'default': 30},
		],
		primary_action: function(){
		    var vals = d.get_values();
			if (vals.from_no > vals.to_no) {
				frappe.msgprint(__("Bis-Nummer muss grösser sein als Von-Nummer"), __("Sensornummern prüfen"));
			} else {
				d.hide();			    
    			// Bis-Wert auf ganzen Etikettenbogen aufrunden
    			var num_pages = Math.ceil((vals.to_no - (vals.from_no - 1)) / 30);
    			frappe.db.set_value("Batch",frm.doc.name,"print_format_parameters",vals.from_no+"-"+num_pages).then(r => {
    			   console.log(r);
    			   var att_url = frappe.urllib.get_full_url(
				     "/api/method/frappe.utils.print_format.download_pdf?"
    				 + "doctype=" + encodeURIComponent(frm.doc.doctype)
    				 + "&name=" + encodeURIComponent(frm.doc.name)
    				 + "&format=QR-Label%20Avery%20Zweckform%2085x14&no_letterhead=0"
    				 + (frm.doc.language ? "&_lang=" + frm.doc.language : "")
			       );
        		   window.open(att_url);
    			});
			}
		},
		primary_action_label: __('PDF erzeugen')
	});
	d.show();
}

function auto_chargennr(frm){
	if(frm.doc.__islocal){
		frappe.call({
			method: 'senstech.scripts.batch_tools.get_next_batch_no',
			args: {
				batch_type: frm.doc.batch_type,
				item_code: frm.doc.item,
				project: frm.doc.project,
				sales_order: frm.doc.sales_order
			},
			callback: (r) => {
				if(r.message) {
					frm.set_value('chargennummer',r.message);
				}
			}
		});
	}
}

function batch_label(frm) {
	frappe.call({
    	'method': 'senstech.scripts.tools.direct_print_doc',
    	'args': {
			'doctype': 'Batch',
    		'name': frm.doc.name,
			'print_format': 'Batch Label ST',
			'printer_name': 'Zebra 57x32'
    	},
		'callback': function(response) {
		}
    });
}