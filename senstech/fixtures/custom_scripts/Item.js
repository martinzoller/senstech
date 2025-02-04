/*

TODO zum "Artikel-Assistent" (Herbst 2023)

Nächste "Ausbaustufen":
- In Chargenmodul die "zusammenhängenden" Artikel mit entsprechenden Funktionen miteinander verknüpfen
  - anlegen kann man nur Substratchargen und (übergangsweise noch) Endprodukt-Chargen
  - Navigation durch den "Artikelbaum" anzeigen, zumindest Ebene 1 oberhalb und 1 unterhalb
  - Sonderfall Sensorsubstrat poliert: Dieses hat "L-Charge" => man legt vom Sensorsubstrat isoliert eine neue Charge an und wählt die "Quellcharge"(n?!?!) aus
  - Bei Lagerbuchungen neu auch den Ausschuss erfassen - das geht: Eine Lagerbuchung kann vom Typ "Fertigung" sein und n Artikel umfassen, einer wird von Zwischenlager nach Nirvana gebucht, der zweite von Nirvana nach Fertiglager [bzw. das Standardlager des jew. Artikels wird verwendet, dieses ist nach Art.grp zu setzen!!] => die Stückzahldifferenz ist der Ausschuss!
- Statistiken zu Ausschuss (vgl. Notiz weiter unten) und Fertigungsdauer

*/


/*

Implementationsnotizen zu Halbfabrikaten (HF-...) und Substraten (PS-..., IS-...), 20.10.23

* Der Artikelcode folgt dem Schema XX-kkk-ppnn
  wobei
  XX  = PS (poliertes Substrat), IS (isoliertes Substrat), HF (sonstiges Halbfabrikat)
  kkk = Kundennr. (011 bei Eigenprodukten)
  pp  = Projektnummer (bezieht sich auf die "Mehrheit" der Endprodukte, die aus dieser Zwischenstufe entstehen - Ausnahmen sind möglich, vgl. Eiger)
  nn  = Index des Substrat- oder Halbfabrikat-Artikels innerhalb Projekt. Zählt ab 01!
  Ausdrücklich verzichtet wird auf:
  - Spez-Revision Rxx (diese kann ggf. als separates Feld in der Produktionscharge festgehalten werden; bei jeder Indexerhöhung sämtliche Vorstufenartikel zu duplizieren, ist unzumutbar und unübersichtlich!)
	=> ENTWEDER bei Prod.chargen isolierter Substrate nach der Spez-Revision fragen, nach der produziert wird (diese dann mitziehen und mit Endprodukt-Artikelcode abgleichen),
	   ODER für die Indexerhöhung von Endprodukten eine spezielle Fkt. machen, die dann fragt, ab welcher Chargennr. die Erhöhung gilt (dann Chargennr. beim Fertigstellen prüfen)
  - Substrat-Durchmesser, Kraftbereich und ähnliche Artikelattribute (diese können als Freitext in der Artikelbeschreibung stehen; da das HF-Schema grundsätzlich mehrere Fabrikationsstufen zulässt, die bei jedem Produkt anders sein können, ist der Artikelcode ohnehin nicht selbsterklärend)
  
* Das Anlegen von Sensorsubstraten und Halbfabrikaten erfolgt zunächst manuell.
  - Jeder Artikel wird mit seinem "vorangehenden" Artikel über das Feld "hergestellt aus" verknüpft.
  - Künftig kann eine Funktion geschaffen werden, um ein "Folge- oder Endprodukt" aus einem Substrat anzulegen (1 Substrat oder Halbfabrikat hat n Folgeprodukte)
  - Bei bestehenden Artikeln wird man die Halbfabrikate im Nachhinein anlegen; hier ist nur eine händische Verknüpfung der bestehenden Endprodukte möglich.
  - Die Artikelbeschreibung soll möglichst einheitlich aufgebaut sein, etwa so:
	o Isoliertes Substrat «Kraftsensor zentriert» 1.0 mm
	o Halbfabrikat «Eiger» 0.5 mm - getrimmt und geschützt
	o Halbfabrikat «Gantrisch» 1.0 mm - bestückt und nachgetrimmt

* Mit der Digitalisierung der PBs und Stücklisten wird die Definition der Zwischenartikel einfacher, da die einzelnen Rohmaterialien und Produktionsschritte, die zu einem bestimmten Substrat/Halbfabrikat führen, dann explizit definiert sind.


AUSSCHUSSGRUND-STATISTIK
- nachträglich machen, nicht Teil des MVP
- als Child Table an der Lagerbuchung anhängen: Prod.charge [identisch 1. Zeile der Lagerbuchung], Stückzahl, Ausschussgrund => so kann dann einfach ein Zusammenzug bei der Charge angezeigt werden
- bei jedem Arbeitsschritt von einem Artikel zum nächsten eine Tabelle mit den Standard-Ausschussgründen anzeigen und die Ausschusszahlen vom PB eintragen lassen (leere Felder als 0 akzeptieren, Gesamtzahl validieren) => dann L'buchung mit Child-Einträgen serverseitig erzeugen


*/

frappe.require('/assets/senstech/js/gate_n.js');

frappe.ui.form.on('Item', {
	before_load(frm) {
	    if (frm.doc.description == frm.doc.item_name) {
			frm.set_value('description','');
		}
	    if((frm.doc.gate2_requested_date && !frm.doc.gate2_reviewed_date) || 
	       (frm.doc.gate3_requested_date && !frm.doc.gate3_reviewed_date)) {
	        frm.set_read_only(); // Bei hängigem Antrag alle Felder schreibschützen (muss offenbar in before_load() passieren, in refresh() geht es nicht)
	    }
	},
	refresh(frm) {
		frm.set_df_property('is_stock_item', 'read_only', true); // Schreibschutz muss manuell gesetzt werden, vermutlich weil is_stock_item standardmässig ein Pflichtfeld ist
		print_format_filters(frm);
		item_specific_fields(frm);
		if (frm.doc.__islocal) {
			if(!frm.doc.item_code){
				frm.set_value('item_code',__('Bitte zuerst Artikelgruppe auswählen'));
			}/* else {
				frappe.db.exists("Item", frm.doc.item_code).then(this_ic => {
					// Item Code identisch schon vorhanden: Vermutlich wurde der Artikel dupliziert
					if(this_ic) {
						frm.fields_dict.item_group.set_value(frm.doc.item_group); // Artikelgruppe neu auswählen und zugehörige Aktion triggern - offenbar doch nicht nötig - MZ 23.01.25
					}
				});
			}	*/		
			// Workaround, da aus "Gründen" das Häkchen has_batch_no beim Anlegen von Artikelvarianten nicht übernommen wird?!
			frm.set_value('has_batch_no', frm.doc.copy_of_has_batch_no);
		}
		else {
			frm.fields_dict.description.$wrapper.find('#variant_description').remove();
			if (frm.doc.variant_of) {
				let variant_desc = '<div id="variant_description"><b>Variantenbeschreibung (erscheint oberhalb der Artikelbeschreibung)</b>';
				frappe.call({
					'method': 'senstech.scripts.item_tools.get_item_variant_description',
					'args': {
						'item': frm.doc.name
					},
					'callback': function(response) {
						variant_desc += response.message + '</div>';
						frm.fields_dict.description.$wrapper.find('#variant_description').remove(); // do this again within the callback to avoid double descriptions in case of double-refresh
						frm.fields_dict.description.$wrapper.prepend(variant_desc);
					}
				});
			}
			get_batch_info(frm);
			frm.add_custom_button(__((frm.doc.has_variants?'Artikelbez. und Variantenzahl drucken':'Lageretikett drucken')), function() {
				lageretikett(frm.doc);
			});
			if (frm.doc.is_purchase_item) {
				frm.add_custom_button(__("Nachbestellen"), function() {
					nachbestellen(frm);
				});
			}
			
			// Gate3-Freigabe: Artikel teilweise gesperrt
			if (frm.doc.gate3_reviewed_date) {
				gate3_lock_item(frm);
			}
			// Umbenennen freigegebener Artikel sperren
			frm.rename_doc = () => {
				if(frm.doc.gate3_reviewed_date) {
					frappe.show_alert({ message: __("Artikel mit Gate-3-Freigabe dürfen nicht umbenannt werden"), indicator: 'red'}, 10);
				}
				else {
					frappe.model.rename_doc(frm.doctype, frm.docname, () => frm.refresh_header());
				}
			}
		}
		
		// Indexerhöhung Rxx - nur Serieprodukte
		if (!frm.doc.__islocal && frm.doc.item_group.startsWith("Serieprodukte") && frm.doc.name.substr(11,2) == '-R') {
			let new_index = ("0"+(parseInt(frm.doc.name.substr(13,2))+1)).substr(-2, 2);
			frm.add_custom_button(__("Artikel duplizieren als -R{0}", [new_index]), function() {
				duplicate_increment_index(frm);
			}, __("Indexerhöhung"));
		}
		
		// Freigabe Gate 2/3 - nur bei Serieprodukten und Eigenprodukt-Vorlagen
		if (!frm.doc.__islocal && (frm.doc.item_group.startsWith("Serieprodukte") || (frm.doc.item_group.startsWith('Eigenprodukte') && frm.doc.has_variants))) {
			let gateN_menu = '🎖️-';
			if(frm.doc.gate2_reviewed_date || frm.doc.creation < '2025-01-01') {
				if(frm.doc.gate2_review_result == "Gate 2 erreicht" || frm.doc.creation < '2025-01-01') {
					gateN_menu = (frm.doc.gate2_review_result == "Gate 2 erreicht") ? '🎖️2' : '🎖️Legacy';
					// Gate 2 durchschritten => Buttons für Gate 3 und zusätzliche Nullserien anzeigen
					// (Bei Legacy-Artikeln auch direkt Gate 3 anzeigen)
					if(frm.doc.gate3_reviewed_date) {
						if(frm.doc.gate3_review_result != "Gate 3 erreicht und Produktionsfreigabe erteilt") {
							// Gate-3-Freigabe abgelehnt
							if(frappe.perm.has_perm("Item", 1, "write")) {
								frm.add_custom_button(__("Gate-3-Review wiederholen"), function() {
									gate3_request(frm, true);
								}, gateN_menu);
								// Zurückziehen nach erfolgtem Review erfordert Review-Berechtigung
								frm.add_custom_button(__("Gate-3-Antrag zurückziehen"), function() {
									check_not_dirty(frm) &&	gateN_withdraw_request(frm, 3);
								}, gateN_menu);
							}
							else {
								frm.add_custom_button(__("Gate-3-Freigabe abgelehnt; keine Berechtigung für neuen Antrag"), () => {}, gateN_menu);
							}
						}
						else {
							gateN_menu = '🎖️3';
							frm.add_custom_button(__("Artikel ist für Serie freigegeben"), () => {}, gateN_menu);
						}
					}
					else if(frm.doc.gate3_requested_date) {
						// Hängiger Antrag für Gate 3
						if(frappe.perm.has_perm("Item", 1, "write") && frm.doc.gate3_requested_by_name != frappe.session.user_fullname) {
							frm.add_custom_button(__("Gate-3-Review durchführen"), function() {
								gate3_request(frm);
							}, gateN_menu);
						}
						if(frappe.perm.has_perm("Item", 0, "write")) {
							frm.add_custom_button(__("Gate-3-Antrag zurückziehen"), function() {
								check_not_dirty(frm) && gateN_withdraw_request(frm, 3);
							}, gateN_menu);
						} else {
							frm.add_custom_button(__("Bearbeitung erfordert höhere Berechtigung."), function() {}, __("Gate-3-Antrag hängig"));
						}
					} else if(frappe.perm.has_perm("Item", 0, "write")) {
						// Gate 2 erteilt, Option für zusätzliche Nullserie oder Gate-3-Antrag
						if(frm.doc.extra_pilot_requested_date) {
							// Zusätzliche Nullserie bereits beantragt
							if(frappe.perm.has_perm("Item", 1, "write") && frm.doc.extra_pilot_requested_by_name != frappe.session.user_fullname) {
								frm.add_custom_button(__("Antrag auf zusätzliche Nullserie bearbeiten"), function() {
									extra_pilot_series(frm, true);
								}, gateN_menu);
							} else {
								frm.add_custom_button(__("Antrag auf zusätzliche Nullserie zurückziehen"), function() {
									frm.set_value('extra_pilot_requested_by_name', '');
									frm.set_value('extra_pilot_requested_date', '');
									frm.save().then(r => {
										frm.reload_doc();
									});
								}, gateN_menu);
							}
						} else {
							frm.add_custom_button(__("Zusätzliche Nullserie beantragen"), function() {
								extra_pilot_series(frm, false);
							}, gateN_menu);
							frm.add_custom_button(__("Gate-3-Freigabe beantragen"), function() {
								gate3_request(frm);
							}, gateN_menu);
						}
					}
				}
				else {
					// Gate-2-Freigabe abgelehnt
					if(frappe.perm.has_perm("Item", 1, "write")) {
						frm.add_custom_button(__("Gate-2-Review wiederholen"), function() {
							gate2_request(frm, true);
						}, gateN_menu);
						// Zurückziehen nach erfolgtem Review erfordert Review-Berechtigung
						frm.add_custom_button(__("Gate-2-Antrag zurückziehen"), function() {
							check_not_dirty(frm) &&	gateN_withdraw_request(frm, 2);
						}, gateN_menu);
					}
					else {
						frm.add_custom_button(__("Gate-2-Freigabe abgelehnt; keine Berechtigung für neuen Antrag"), function() {}, gateN_menu);
					}
				}
			}	
			// Gate-2-Freigabeantrag gestellt
			else if(frm.doc.gate2_requested_date) {
				if(frappe.perm.has_perm("Item", 1, "write") && frm.doc.gate2_requested_by_user != frappe.user.name) {
					frm.add_custom_button(__("Gate-2-Review durchführen"), function() {
						gate2_request(frm);
					}, gateN_menu);
				}
				if(frappe.perm.has_perm("Item", 0, "write")) {
					frm.add_custom_button(__("Gate-2-Antrag zurückziehen"), function() {
						check_not_dirty(frm) && gateN_withdraw_request(frm, 2);
					}, gateN_menu);
				} else {
					frm.add_custom_button(__("Bearbeitung erfordert höhere Berechtigung."), function() {}, __("Gate-2-Antrag hängig"));
				}
			} else if(frappe.perm.has_perm("Item", 0, "write")) {
				frm.add_custom_button(__("Gate-2-Freigabe beantragen"), function() {
					gate2_request(frm);
				}, gateN_menu);
			}
			
		}
	},
	validate(frm) {
		let item_grp = frm.doc.item_group;
		let item_code = frm.doc.item_code;
		frm.set_value('has_batch_no', frm.doc.copy_of_has_batch_no);		
		var plain_description = frm.doc.description.replaceAll('<div>','').replaceAll('</div>','').replaceAll('<br>','');
		if (plain_description == '' || plain_description == '-' || plain_description == item_code) {
			frm.set_value('description', frm.doc.item_name);
		}
		if (frm.doc.is_sales_item && frm.doc.is_purchase_item) {
			validation_error(frm, 'is_sales_item', __("Ein Artikel darf nicht als Einkaufs- wie auch Verkaufsartikel definiert sein."));
		}
		if (frm.doc.benoetigt_chargenfreigabe && !frm.doc.has_batch_no) {
			validation_error(frm, 'has_batch_no', __("Chargenfreigabe ist nur bei aktivierter Chargennummer möglich"));
		}
		if (!text_field_empty(frm.doc.qualitaetsspezifikation)  && !frm.doc.benoetigt_chargenfreigabe) {
			validation_error(frm, 'benoetigt_chargenfreigabe', __("Ein COC kann nur bei freigegebenen Chargen erzeugt werden. Bitte Chargenfreigabe aktivieren oder Qualitätsspezifikation leer lassen."));
		}
		if (['Verkauf','Einkauf','Intern'].includes(item_grp)) {
			validation_error(frm, 'item_group', __("Die übergeordneten Artikelgruppen 'Einkauf', 'Verkauf' und 'Intern' dürfen keinem Artikel zugewiesen werden."));
		}
		if(item_grp.startsWith('Eigenprodukte') && !frm.doc.variant_of && !frm.doc.has_variants) {
			validation_error(frm, 'has_variants', __("In den Artikelgruppen für Eigenprodukte sind nur Artikelvorlagen und -varianten erlaubt"));
		}		
		if(!item_grp.startsWith('Eigenprodukte') && (frm.doc.variant_of ||frm.doc.has_variants)) {
			validation_error(frm, 'has_variants', __("Artikelvorlagen und -varianten sind nur bei Eigenprodukten erlaubt"));
		}
		if(item_grp.startsWith('Eigenprodukte') && !frm.doc.single_label_print_format) {
			validation_error(frm, 'single_label_print_format', __("Bei Eigenprodukten bitte ein Druckformat für die Verpackung von  Einzelsensoren auswählen"));
		}
		if(item_grp != 'Infrastruktur' && frm.doc.is_fixed_asset) {
			validation_error(frm, 'is_fixed_asset', __("Anlagevermögen ist nur in der Artikelgruppe 'Infrastruktur' erlaubt"));
		}

		// Übergeordnete Artikelgruppe abfragen => für nachfolgende Validierungen notwendig
		frappe.db.get_doc("Item Group", item_grp).then(grp => {
			let parent_grp = grp.parent_item_group;
			
			// VALIDIERUNG ARTIKELCODE
			if(item_grp == 'Buchhaltungskonten Aufwand') {
				if(frm.doc.item_defaults.length>0) {
					let exp_account = frm.doc.item_defaults[0].expense_account.substr(0,4);
					if(item_code != 'AC-'+exp_account) {
						validation_error(frm, 'item_code', __('Der Artikelcode von Buchhaltungskonto-Artikeln muss dem Schema "AC-####" entsprechen und mit dem verknüpften Aufwandkonto übereinstimmen'));
					}
				} else {
					validation_error(frm, 'item_code', __("Buchhaltungskonto-Artikel müssen mit einem Aufwandkonto verknüpft sein"));
				}
			}
			else if(item_grp == 'Infrastruktur' && frm.doc.is_fixed_asset) {
				if(frm.doc.item_name != frm.doc.asset_category) {
					validation_error(frm, 'item_name', __("Anlagevermögensartikel müssen denselben Namen tragen wie die verknüpfte Anlagekategorie"));
				}
				frappe.db.get_value("Asset Category Account", { 'parent': frm.doc.asset_category }, "fixed_asset_account", null, 'Asset Category').then(r => {
					if(r.message && r.message.fixed_asset_account) {
						if(item_code != 'IN-'+r.message.fixed_asset_account.substr(0,4)) {
							validation_error(frm, 'item_code', __('Der Artikelcode von Anlagevermögensartikeln muss dem Schema "IN-####" entsprechen und mit dem Anlagevermögenskonto der verknüpften Anlagekategorie übereinstimmen'));
						}
					}
					else {
						validation_error(frm, 'item_code', __("Fehler beim Validieren des Artikelcodes eines Anlagevermögensartikels"));
					}
				});
			}
			else if(parent_grp == 'Einkauf') {
				// alle anderen Einkaufsartikel (Infrastruktur-Unterhalt, Dienstleistungen, Rohmaterial, Verbrauchsmaterial)
				const pt_regex = /^PT-[0-9]{5}$/;
				if(!pt_regex.test(item_code)) {
					validation_error(frm, 'item_code', __('Der Artikelcode der meisten Einkaufsartikel muss dem Schema "PT-#####" entsprechen'));
				}
			}
			else if(item_grp.startsWith('Eigenprodukte')) {
				// Eigenprodukte: Der Variantencode wird derzeit nicht mit den Attributen abgeglichen, da er in der Regel ohnehin automatisch erzeugt wird
				const eigenprod_template_regex = /^[A-Z]{2}-011-[0-9]{2}00$/;
				const eigenprod_variant_regex = /^[A-Z]{2}-011-[0-9]{2}00(-[A-Z0-9]+)*$/;
				if(frm.doc.has_variants && !eigenprod_template_regex.test(item_code)) {
					validation_error(frm, 'item_code', __('Der Artikelcode von Eigenproduktvorlagen muss dem Schema "XX-011-nn00" entsprechen'));
				}
				if(frm.doc.variant_of && !eigenprod_variant_regex.test(item_code)) {
					validation_error(frm, 'item_code', __('Der Artikelcode von Eigenproduktvarianten muss dem Schema "XX-011-nn00-Axxx-Byyy-Czzz-...." entsprechen'));
				}
				validate_customer_and_project(frm);
			}
			else if(['Halbfabrikate','Sensorsubstrate poliert','Sensorsubstrate isoliert','Wiederkehrende Lohnfertigung (PZ-2002)'].includes(item_grp)) {
				// Halbfabrikate:   HF-kkk-nnxx, wobei kkk die Kundennr. ist
				// Sensorsubstrate poliert:  PS-kkk-nnxx
				// Sensorsubstrate isoliert: IS-kkk-nnxx
				// Wiederkehrende Lohnfertigung: LF-kkk-nnxx
				let intermediate_goods_regex = new RegExp(`^${item_code_prefix_from_group(item_grp)}-[0-9]{3}-[0-9]{4}$`);
				if(!intermediate_goods_regex.test(item_code)) {
					validation_error(frm, 'item_code', __('Der Artikelcode von Sensorsubstraten, Halbfabrikaten und Lohnfertigungsartikeln muss dem Schema "HF|PS|IS|LF-kkk-ppnn" entsprechen'));
				}
				validate_customer_and_project(frm);
				let intermediate_goods_index = item_code.substr(9,2);
				if(intermediate_goods_index == 0) {
					validation_error(frm, 'item_code', __("Der Artikelindex 'nn' im Namensschema XX-kkk-ppnn muss mindestens 1 sein"));
				}
			}
			else if(item_grp.startsWith('Serieprodukte')) {
				const series_prod_regex = /^PR-[0-9]{3}-[0-9]{2}00-R[0-9]{2}-T[0-9]{2}$/;
				if(!series_prod_regex.test(item_code)) {
					validation_error(frm, 'item_code', __('Der Artikelcode von Serieprodukten muss dem Schema "PR-kkk-nn00-Rxx-Tyy" entsprechen'));
				}
				validate_customer_and_project(frm);	
			}
			else {
				// alle anderen Verkaufsartikel (Entwicklung, Kleinaufträge, Versandkosten, Gebühren und Abgaben, Geräte und Komponenten, Immobilienvermietung, übrige Dienstleistungen)
				const gp_regex = /^GP-[0-9]{5}$/;
				if(!gp_regex.test(item_code)) {
					validation_error(frm, 'item_code', __('Der Artikelcode generischer Verkaufsartikel muss dem Schema "GP-#####" entsprechen'));
				}
			}
			
			// VALIDIERUNG FELD 'HERGESTELLT AUS'
			if(frm.doc.manufactured_from) {
				frappe.db.get_doc("Item", frm.doc.manufactured_from).then(manuf_from => {
					let prev_grp = manuf_from.item_group;
					if(['Halbfabrikate','Eigenprodukte mit Chargenfreigabe','Eigenprodukte ohne Chargenfreigabe','Serieprodukte kundenspezifisch mit Chargenfreigabe','Serieprodukte kundenspezifisch ohne Chargenfreigabe'].includes(item_grp)) {
						if(!['Sensorsubstrate poliert','Halbfabrikate'].includes(prev_grp)) {
							validation_error(frm, 'manufactured_from', __("Halbfabrikate und Endprodukte können nur aus Halbfabrikaten oder polierten Sensorsubstraten hergestellt werden"));
						}
					}
					else if(item_grp == 'Sensorsubstrate isoliert') {
						if(prev_grp != 'Sensorsubstrate poliert') {
							validation_error(frm, 'manufactured_from', __("Isolierte Sensorsubstrate können nur aus polierten Sensorsubstraten hergestellt werden"));
						}
					}
					else if(['Sensorsubstrate poliert','Wiederkehrende Lohnfertigung (PZ-2002)'].includes(item_grp)) {
						if(!prev_grp.startsWith('Rohmaterial')) {
							validation_error(frm, 'manufactured_from', __("Polierte Sensorsubstrate und Lohnfertigungsartikel können nur aus Rohmaterial hergestellt werden"));
						}
					}
					else {
						// alle anderen Artikelgruppen (einkaufs- wie verkaufsseitig) brauchen dieses Feld nicht
						validation_error(frm, 'manufactured_from', __("Das Feld 'Hergestellt aus' ist bei Einkaufsartikeln und generischen Verkaufsartikeln leer zu lassen"));
					}
				});
			}
			else {
				// TODO - langfristig auch bei allen Endprodukten und bei polierten Sensorsubstraten verbieten, 'manufactured_from' leer zu lassen
				//        Aber Vorsicht, wenn HF- oder Substratartikel nur aus Endprodukt angelegt werden kann, geht das nicht auf...!
				if(['Sensorsubstrate isoliert','Halbfabrikate'].includes(item_grp)) {
					validation_error(frm, 'manufactured_from', __("Bei Artikeln dieser Artikelgruppe muss das Feld 'Hergestellt aus' ausgefüllt sein"));
				}
			}
		});
	},
	item_group(frm) {
		let item_grp = frm.doc.item_group;
		let item_code = frm.doc.item_code;
		if(!item_grp) {
			return;
		}
		frappe.db.get_doc("Item Group", item_grp).then(grp => {
			let parent_grp = grp.parent_item_group;
			
			// Einkaufs-/Verkaufsartikel
			frm.set_value('is_sales_item', parent_grp == "Verkauf");
			frm.set_value('is_purchase_item', parent_grp == "Einkauf");
			
			// Varianten
			if(!item_grp.startsWith('Eigenprodukte')) {
				frm.set_value('has_variants', false);
			}
			
			// Lager verwalten (is_stock_item), Hat Chargennummer (has_batch_no) und Benötigt Chargenfreigabe (benoetigt_chargenfreigabe):
			// Werden automatisch von Artikelgruppe geholt und sind als Felder schreibgeschützt. Daher keine Behandlung im Code notwendig!			
			
			// Artikelcode:
			// - Automatisch setzen bei neuem Artikel (soweit möglich)
			// - ansonsten nur Validierung
			if(frm.doc.__islocal){
				if(item_grp == 'Buchhaltungskonten Aufwand') {
					if(frm.doc.item_defaults.length>0 && frm.doc.item_defaults[0].expense_account) {
						frm.set_value('item_code', 'AC-'+frm.doc.item_defaults[0].expense_account.substr(0,4));
					} else {
						frm.set_value('item_code', 'Zuerst Aufwandkonto wählen');
						frm.scroll_to_field('item_defaults'); // Hier gleich zu Aufwandkonto scrollen, da man sonst kaum etwas anpassen muss
					}
				}
				else if(item_grp == 'Infrastruktur' && frm.doc.is_fixed_asset) {
					if(frm.doc.asset_category) {
						set_item_code_for_asset_category(frm);
					} else {
						frm.set_value('item_code', 'Zuerst Anlagekategorie wählen');
					}
				}
				else if(parent_grp == 'Einkauf') {
					// alle anderen Einkaufsartikel (Infrastruktur-Unterhalt, Dienstleistungen, Rohmaterial, Verbrauchsmaterial)
					set_new_generic_item_code(frm, 'PT');
				}
				else if(item_grp.startsWith('Eigenprodukte')) {
					// Eigenprodukte: Nur Artikelvorlagen werden manuell angelegt
					if(frm.doc.variant_of) {
						frm.set_value('item_code', 'Artikelvariante muss aus Vorlage angelegt werden');
						frappe.msgprint(__("Neue Varianten von Eigenprodukten bitte nicht manuell anlegen."), __("Bitte Artikelvorlage verwenden"));
					}
					else{
						frm.set_value('has_variants', true);
						let eigenprod_popup = new frappe.ui.Dialog({
							'title': __('Artikelvorlage für Eigenprodukt anlegen'),
							'fields': [
								{'fieldname': 'sensor_type', 'fieldtype': 'Select', 'reqd': 1, 'label': __('Produktart'), 'options': [
									{ 'value': 'SR', 'label': __('Sensor (SR-)') },
									{ 'value': 'SA', 'label': __('Signalverstärker (SA-)') },
									{ 'value': 'PR', 'label': __('Sonstiges Produkt (PR-)') },
									{ 'value': 'KB', 'label': __('Legacy: Kraftsensor-Bügel (KB-)') },
									{ 'value': 'KE', 'label': __('Legacy: Kraftsensor Eiger (KE-)') },									
									{ 'value': 'KZ', 'label': __('Legacy: Kraftsensor zentriert (KZ-)') },
								]},
								{
									'fieldname': 'project_no',
									'fieldtype': 'Select',
									'label': __('Projektnummer'),
									'description': 'XX-011-<b>##</b>00',
									'options': []
								},
							],
							'primary_action': function(){
								let val = eigenprod_popup.get_values();
								if (val.sensor_type && val.project_no) {
									eigenprod_popup.hide();
									frm.set_value('item_code', val.sensor_type+'-011-'+val.project_no+'00');
								} else {
									frappe.msgprint(__("Bitte alle Felder ausfüllen"), __("Angaben unvollständig"));
								}
							},
							'primary_action_label': __('OK')
						});
						get_customer_projects(frm, proj_list => {
							eigenprod_popup.set_df_property('project_no', 'options', proj_list);
							if(item_code) {
								eigenprod_popup.set_value('sensor_type', item_code.substr(0,2));
								eigenprod_popup.set_value('project_no', item_code.substr(7,2));
							}
							eigenprod_popup.show();
						});
						
					}
				}
				else if(['Halbfabrikate','Sensorsubstrate poliert','Sensorsubstrate isoliert','Wiederkehrende Lohnfertigung (PZ-2002)'].includes(item_grp)) {
					let ic_prefix = item_code_prefix_from_group(item_grp);
					let int_prod_popup = new frappe.ui.Dialog({
						'title': __(item_type_from_group(item_grp)+' anlegen'),
						'fields': [
							{
								'fieldname': 'item_group',
								'fieldtype': 'HTML',
								'options': __('Artikelgruppe:')+' '+item_grp,
							},
							{
								'fieldname': 'end_product_type',
								'fieldtype': 'Select',
								'label': __('Art der Endprodukte'),
								'depends_on': f => (item_grp != 'Wiederkehrende Lohnfertigung (PZ-2002)'),
								'default': item_grp == 'Wiederkehrende Lohnfertigung (PZ-2002)'?'custom':'',
								'options': [
									{ 'value': 'custom', 'label': __('Kundenspezifische Produkte') },
									{ 'value': 'own', 'label': __('Eigenprodukte') },
								],
								'change': e => {
									if(int_prod_popup.fields_dict.end_product_type.value == 'own') {
										get_customer_projects(frm, proj_list => {
											int_prod_popup.set_df_property('project_no', 'options', proj_list);
										}, 'CU-00011');
									} else {
										// Kundenspezifisch: Liste erst bei Kundenauswahl füllen
										int_prod_popup.set_df_property('project_no', 'options', []);
									}
									
								}
							},
							{
								'fieldname': 'customer',
								'fieldtype': 'Link',
								'options': 'Customer',
								'label': __('Kunde'),
								'depends_on': doc => doc.end_product_type == 'custom',
								'change': e => {
									get_customer_projects(frm, proj_list => {
										int_prod_popup.set_df_property('project_no', 'options', proj_list);
									}, int_prod_popup.fields_dict.customer.value);
								}
							},
							{
								'fieldname': 'project_no',
								'fieldtype': 'Select',
								'label': __('Projektnummer'),
								'description': ic_prefix+'-kkk-<b>XX</b>nn',
								'options': []
							}
						],
						'primary_action': function(){
							let val = int_prod_popup.get_values();
							if ((val.end_product_type == 'own' || val.customer) && val.project_no) {
								int_prod_popup.hide();
								let cust_proj = (val.end_product_type == 'own' ? '011' : val.customer.substr(5,3))+'-'+val.project_no;
								let base_item_code = ic_prefix+'-'+cust_proj;
								find_and_set_mountain(frm, cust_proj);
								frappe.call({
									'method': 'senstech.scripts.item_tools.get_next_item_code_part',
									'args': {
										'ic_filter_string': base_item_code,
										'ic_filter_startpos': 0,
										'ic_part_startpos': 9,
										'ic_part_length': 2
									},
									'callback': function(response) {
										var next_number = response.message;
										if (next_number) {
											frm.set_value('item_code', base_item_code+next_number);
											if(val.end_product_type == 'custom') {
												// Kunde im Artikel auch setzen
												// Umgekehrt ist es der Einfachheit halber nicht verknüpft (bei nachträglicher Änderung des Kunden muss Artikelcode von Hand angepasst werden)
												// Beim Speichern wird jedoch Kundennr. im Artikelcode mit Kundennr. des Artikels abgeglichen
												frm.set_value('kunde', val.customer);
											}
										} else {
											frappe.msgprint(__("Fehler beim Ermitteln des nächsten freien Artikelcodes"), __("Artikelcode-Auswahl"));
										}
									}
								});
							} else {
								frappe.msgprint(__("Bitte alle Felder ausfüllen"), __("Angaben unvollständig"));
							}
						},
						
						'primary_action_label': __('OK')
					});
					int_prod_popup.show();
					// Wenn Daten vorhanden, Felder der Reihe nach ausfüllen, um jeweilige Aktionen zu triggern
					if(item_code) {
						if(item_code.substr(3,3) >= 100) {
							int_prod_popup.set_value('end_product_type','custom').then(() => {
								if(frm.doc.kunde) {
									int_prod_popup.set_value('customer', frm.doc.kunde).then(() => {
										int_prod_popup.set_value('project_no', item_code.substr(7,2));
									});
								}
							});
						} else {
							int_prod_popup.set_value('end_product_type', 'own').then(() => {
								int_prod_popup.set_value('project_no', item_code.substr(7,2));
							});
						}
					}
				}
				else if(item_grp.startsWith('Serieprodukte')) {
					let ser_prod_popup = new frappe.ui.Dialog({
						'title': __('Serieprodukt anlegen'),
						'fields': [
							{
								'fieldname': 'item_group',
								'fieldtype': 'HTML',
								'options': __('Artikelgruppe:')+' '+item_grp,
							},
							{
								'fieldname': 'customer',
								'fieldtype': 'Link',
								'options': 'Customer',
								'label': __('Kunde'),
								'change': e => {
									get_customer_projects(frm, proj_list => {
										ser_prod_popup.set_df_property('project_no', 'options', proj_list);
									}, ser_prod_popup.fields_dict.customer.value);
								}
							},
							{
								'fieldname': 'project_no',
								'fieldtype': 'Select',
								'label': __('Projektnummer'),
								'description': 'PR-kkk-<b>XX</b>00',
								'options': [],
								'change': e => {
									get_spec_revision_numbers(frm, p_nums => {
										let next_no = "R01";
										if(p_nums.length > 0) {
											next_no = 'R'+String(parseInt(p_nums[p_nums.length-1].substr(1))+1).padStart(2,'0');
										}
										p_nums.push({ 'value': next_no, 'label': next_no+' '+__("(neu)") });
										ser_prod_popup.set_df_property('spec_revision', 'options', p_nums);
									}, ser_prod_popup.fields_dict.customer.value, ser_prod_popup.fields_dict.project_no.value);
								}
							},
							{
								'fieldname': 'spec_revision',
								'fieldtype': 'Select',
								'label': __('Spezifikations-Revisionsnr. Senstech'),
								'description': 'PR-kkk-pp00-<b>Rxx</b>',
								'options': [],
								'change': e => {
									get_type_index_numbers(frm, p_nums => {
										let next_no = "T01";
										if(p_nums.length > 0) {
											next_no = 'T'+String(parseInt(p_nums[p_nums.length-1].substr(1))+1).padStart(2,'0');
										}
										p_nums.push({ 'value': next_no, 'label': next_no+' '+__("(neu)") });
										ser_prod_popup.set_df_property('type_index', 'options', p_nums);
									}, ser_prod_popup.fields_dict.customer.value, ser_prod_popup.fields_dict.project_no.value);
								}
							},
							{
								'fieldname': 'type_index',
								'fieldtype': 'Select',
								'label': __('Typenindex'),
								'description': 'PR-kkk-pp00-Rxx-<b>Tyy</b>',
								'options': []
							}
						],
						'primary_action': function(){
							let val = ser_prod_popup.get_values();
							if (val.customer && val.project_no && val.spec_revision && val.type_index) {
								ser_prod_popup.hide();
								let cust_proj = val.customer.substr(5,3)+'-'+val.project_no;
								let new_item_code = 'PR-'+cust_proj+'00-'+val.spec_revision+'-'+val.type_index;
								frm.set_value('item_code', new_item_code);
								frm.set_value('kunde', val.customer);
								find_and_set_mountain(frm, cust_proj);
							} else {
								frappe.msgprint(__("Bitte alle Felder ausfüllen"), __("Angaben unvollständig"));
							}
						},
						
						'primary_action_label': __('OK')
					});
					ser_prod_popup.show();
					// Wenn Daten vorhanden, Felder der Reihe nach ausfüllen, um jeweilige Aktionen zu triggern
					if(frm.doc.kunde) {
						ser_prod_popup.set_value('customer', frm.doc.kunde).then(() => {
							if(item_code) {
								ser_prod_popup.set_value('project_no', item_code.substr(7,2)).then(() => {
									ser_prod_popup.set_value('spec_revision', item_code.substr(12, 3)).then(() => {
										ser_prod_popup.set_value('type_index', item_code.substr(16, 3));
									});
								});
							}
						});
					}
				}
				else {
					// alle anderen Verkaufsartikel (Entwicklung, Kleinaufträge, Versandkosten, Gebühren und Abgaben, Geräte und Komponenten, Immobilienvermietung, übrige Dienstleistungen)
					set_new_generic_item_code(frm, 'GP');
				}
			}
		});
	},
	asset_category(frm) {
		if(frm.doc.__islocal && frm.doc.item_group == 'Infrastruktur') {
			set_item_code_for_asset_category(frm);
		}
	},
	copy_of_has_batch_no(frm) {
		frm.set_value('has_batch_no', frm.doc.copy_of_has_batch_no);
	},
	artikelcode_kunde(frm) {
		frm.set_value('artikelcode_kunde_als_barcode', frm.doc.artikelcode_kunde);
	},
	artikelcode_kunde_als_barcode(frm) {
		frm.set_value('artikelcode_kunde_als_barcode_raw', frm.doc.artikelcode_kunde_als_barcode);
	},
	item_code(frm) {
		if (frm.doc.item_name == frm.doc.item_code) {
			frm.set_value('item_name','')
		}
		if (frm.doc.description == frm.doc.item_code) {
			frm.set_value('description','')
		}
		item_specific_fields(frm);
	},
	mountain_name(frm) {
		if(frm.doc.item_code && frm.doc.item_code[2] == '-' && frm.doc.mountain_name && !frm.doc.item_name) {
			if(frm.doc.item_group.startsWith('Serieprodukte')) {
				let type_index = parseInt(frm.doc.item_code.substr(17,2));
				let type_str = (type_index > 1 ? ' '+type_index : '');
				frm.set_value('item_name','OEM-Sensor «'+frm.doc.mountain_name+type_str+'»');
			}
		}
	},
	after_save(frm) {
		if (frm.doc.description == frm.doc.item_name) {
			frm.set_value('description','');
		}
	},
});

frappe.ui.form.on('Item Default', {
	expense_account: function(frm, cdt, cdn) {
		if(frm.doc.__islocal && frm.doc.item_group == 'Buchhaltungskonten Aufwand') {
			if(frm.doc.item_defaults.length>0 && frm.doc.item_defaults[0].expense_account) {
				frm.doc.set_value('item_code', 'AC-'+frm.doc.item_defaults[0].expense_account);
			}
		}
   }
});

// Gate-2-spezifischer Wrapper; prüft noch Artikeldaten, die es braucht, um das Formular ausfüllen zu können
function gate2_request(frm, clear_review=false) {
	if(!frm.doc.project || !frm.doc.kunde) {
		frappe.msgprint(__("Bitte die Felder 'Entwicklungsprojekt' und 'Kunde' ausfüllen."), __("Artikeldaten unvollständig"));
		return;
	}
	let callback_after_fetch = function() {
		if(clear_review) {
			gateN_clear_review(frm, 2);
		}
		gateN_dialog(frm, 2);
	}
	
	if(check_not_dirty(frm)) {
		if(!frm.doc.gate2_requested_date) { 
			frappe.call({
				method: 'senstech.scripts.item_tools.get_pilot_series_order',
				args: {
					item_code: frm.doc.name,
					customer: frm.doc.kunde
				},
				callback: (r) => {
					if(r.message && r.message.startsWith("SO-")){
						frm.set_value("gate2_fetch_pilot_series_order", r.message);
					} else {
						frm.set_value("gate2_fetch_pilot_series_order", '');
						frappe.msgprint(__("Jede Artikelfreigabe oder Indexerhöhung erfordert zwingend die Bestellung einer Nullserie durch den Kunden. Bitte eine Kunden-AB anlegen, die den freizugebenden Artikel und den Nullserie-Artikel GP-00003 enthält. Falls die Nullserie anderweitig bestellt wurde, manuell die passende AB auswählen."), __("Nullserie-AB nicht gefunden"))
					}
					callback_after_fetch();
					
				},
				error: (r) => {
					frappe.msgprint(__("Unbekannter Fehler beim Abfragen der Nullserie-AB"));
				}
			});
		}
		else {
			// Review: Nullserie-AB nicht nochmals abfragen
			callback_after_fetch();
		}
	}
}

// Gate-3-spezifischer Wrapper
function gate3_request(frm, clear_review=false) {
	if(check_not_dirty(frm)) {
		if(clear_review) {
			gateN_clear_review(frm, 3);
		}
		if(frm.doc.creation < '2025-01-01') {
			// Legacy-Artikel: Nullserie-Stückzahl nicht erfassen
			frm.set_value("gate3_fetch_pilot_series", "Nicht erfasst (Legacy-Artikel)");
			gateN_dialog(frm, 3);
		}
		else {
			frappe.call({
				method: 'senstech.scripts.batch_tools.get_pilot_series_qty',
				args: {
					item_code: frm.doc.name,
				},
				callback: (r) => {
					if(r.message){
						frm.set_value("gate3_fetch_pilot_series", r.message);
						gateN_dialog(frm, 3);
					} else {
						frappe.msgprint(__("Bitte die Sensoren der Nullserie an Lager legen. Eine fertig ausgelieferte Nullserie ist Voraussetzung für Gate 3."), __("Fehlende Lagerbuchung"))
					}
				},
				error: (r) => {
					frappe.msgprint(__("Unbekannter Fehler beim Abfragen der Nullserie-Gesamtstückzahl"));
				}
			});
		}
	}
}


function get_batch_info(frm) {
    frappe.call({
    	'method': 'senstech.scripts.item_tools.get_batch_info',
    	'args': {
    		'item_code': frm.doc.item_code
    	},
        'callback': function(response) {
            var batches = response.message;
            if ((batches) && (batches.length > 0)) {
                var html = "<table class=\"table\" style=\"width: 100%;\">";
                html += "<tr><th>" + __("Batch") 
                        + "</th><th>" + __("Qty") 
                        + "</th></tr>";
                for (var i = 0; i < batches.length; i++) {
                    html += ("<tr><td><a href=\"/desk#Form/Batch/" 
                         + batches[i].batch_no 
                         + "\">" + batches[i].batch_no 
                         + "</a></td><td>" 
                         + batches[i].qty + " " + batches[i].stock_uom + "</td>");
                }
                html += "</table>";
                frm.set_df_property('batch_overview_html','options',html);
            } else if (batches) {
                frm.set_df_property('batch_overview_html','options',__("No batches available."));
            }
        }
    });
}

// Nächsten Artikelcode für allgemeine Einkaufs- oder Verkaufsartikel (PT-##### bzw. GP-#####) ermitteln und ins Feld schreiben
function set_new_generic_item_code(frm, prefix) {
	frappe.call({
    	'method': 'senstech.scripts.item_tools.get_next_item_code_part',
		'args': {
			'ic_filter_string': prefix+'-',
			'ic_filter_startpos': 0,
			'ic_part_startpos': 3,
			'ic_part_length': 5
		},
    	'callback': function(response) {
            var next_number = response.message;
            if (next_number) {
                frm.set_value('item_code', prefix+'-'+next_number);
            }
        }
    });
}

// Bestehende Projektnummern und -namen eines Kunden (oder intern) als Liste abrufen und eine Option "neues Projekt" hinzufügen
function get_customer_projects(frm, callback, customer_id='CU-00011') {
	frappe.call({
    	'method': 'senstech.scripts.item_tools.get_project_list_for_select_field',
		'args': {
			'customer_id': customer_id,
		},
    	'callback': function(response) {
			let projects = response.message;
			let next_no = "01";
			if(projects.length > 0) {
				let last_proj = projects[projects.length - 1].value;
				next_no = String(parseInt(last_proj)+1).padStart(2,'0');
			}
			projects.push({ 'value': next_no, 'label': next_no+' - '+__("Neues Projekt") });
            callback(projects);
        }
    });
}

// Bestehende Spez-Revisionsnummern eines Projektes als Liste abrufen
function get_spec_revision_numbers(frm, callback, customer_id, project_no) {
	let cust_str = 'PR-'+customer_id.substr(5,3)+'-'+project_no+'00-';
	frappe.call({
    	'method': 'senstech.scripts.item_tools.get_filtered_list_of_item_code_parts',
		'args': {
			'item_group_filter': 'Serieprodukte%',
			'ic_filter_string': cust_str,
			'ic_filter_startpos': 0,
			'ic_part_startpos': 12,
			'ic_part_length': 3
		},
    	'callback': function(response) {
            callback(response.message);
        }
    });
}

// Bestehende Typenindizes eines Projektes als Liste abrufen
// [Hinweis: Der Typenindex wird über alle Spez-Revisionen hinweg betrachtet]
function get_type_index_numbers(frm, callback, customer_id, project_no) {
	let cust_str = 'PR-'+customer_id.substr(5,3)+'-'+project_no+'00-';
	frappe.call({
    	'method': 'senstech.scripts.item_tools.get_filtered_list_of_item_code_parts',
		'args': {
			'item_group_filter': 'Serieprodukte%',
			'ic_filter_string': cust_str,
			'ic_filter_startpos': 0,
			'ic_part_startpos': 16,
			'ic_part_length': 3
		},
    	'callback': function(response) {
            callback(response.message);
        }
    });
}


function print_format_filters(frm) {
	let filter_func = function() {
        return {
            filters: { doc_type: 'Senstech Messdaten' }
        };
	};
	frm.set_query('single_label_print_format', filter_func);	
	frm.set_query('flag_label_print_format', filter_func);		
}


function item_specific_fields(frm) {
	
	// Artikel mit Produktions- und möglichem Kundenbezug
	if(!frm.doc.is_purchase_item && frm.doc.item_code && frm.doc.item_code[2] == '-' && !['AC-','PT-','IN-','GP-'].includes(frm.doc.item_code.substr(0,3))) {
		let project_code = frm.doc.item_code.substr(3,6);
		frm.set_query('manufactured_from', () => {
			return {
				filters: {
					item_code: ['LIKE', '%-'+project_code+'%'],
					item_group: ['IN', ['Sensorsubstrate poliert', 'Sensorsubstrate isoliert', 'Halbfabrikate']]
				}
			};
		});
		// Projekt nicht gesetzt oder nicht der Erwartung entsprechend
		let project_id = 'EP-'+project_code;
		if(frm.doc.project != project_id) {
			frappe.db.exists('Project', project_id).then(project_exists => {
				if(project_exists) {
					frm.set_value('project', project_id);
					frappe.show_alert({message: __('Entwicklungsprojekt automatisch zugewiesen, bitte Artikel speichern'), indicator: 'green'}, 10);
				}
				else {
					let ic_customer = 'CU-00'+frm.doc.item_code.substr(3,3);
					let ic_project_type = ic_customer.startsWith('CU-0001') ? 'Intern' : 'Extern';
					let js_link = "{ let p = frappe.model.get_new_doc('Project'); p.copy_of_project_type = '"+ic_project_type+"'; p.project_name = '"+project_id+"';";
					if(ic_project_type == 'Extern') {
						js_link += "p.customer = '"+ic_customer+"';";
					}
					js_link += "frappe.set_route('Form', 'Project', p.name); }"
					frappe.show_alert({message: __("Entwicklungsprojekt '{0}' existiert noch nicht, bitte anlegen!", [project_id])+'<br><br><a onclick="'+js_link+'">'+__("&gt; Projekt anlegen")+'</a>', indicator: 'orange'}, 10);
				}
			});
		}	
		// Kunde wird durch Artikelgruppen-Assistenten automatisch gesetzt und umfangreich validiert, daher hier nicht setzen
	}
	
	// Artikel ohne Produktions- und Kundenbezug
	else {
		let clear_fields = ['kunde', 'kundenname', 'project', 'artikelcode_kunde', 'produktrevision_kunde', 'qualitaetsspezifikation'];
		// Auch kein interner Produktionsbezug: weitere Felder leeren
		if(frm.doc.is_purchase_item) {
			clear_fields.push('manufactured_from');
			clear_fields.push('project');
		}
		// Felder leeren; die betreffenden Abschnitte werden ohnehin durch Anzeigebedingungen ausgeblendet
		clear_fields.forEach(f => {
			frm.set_value(f, '');
		})
	}
	
}


function nachbestellen(frm) {
	if (frm.doc.supplier_items.length < 1) {
		frappe.msgprint(__("Es ist kein Standard-Lieferant hinterlegt"), __("Fehlender Lieferant"));
	} else if (frm.doc.supplier_items.length == 1) {
		_nachbestellen(frm, frm.doc.supplier_items[0].supplier, frm.doc.supplier_items[0].order_qty)
	} else {
		var lieferanten = '';
		frm.doc.supplier_items.forEach(function(entry) {
			lieferanten += entry.supplier + "\n";
		});
		frappe.prompt([
			{'fieldname': 'supplier', 'fieldtype': 'Select', 'label': __("Supplier"), 'reqd': 1, 'options': lieferanten}  
		],
		function(values){
			var lieferant = values.supplier;
			var qty = 0;
			frm.doc.supplier_items.forEach(function(entry) {
				if (entry.supplier == lieferant) {
					qty = entry.order_qty;
				}
			});
			_nachbestellen(frm, lieferant, qty)
		},
		__("Auswahl Lieferant"),
		__("Weiter")
		)
	}
}

function _nachbestellen(frm, supplier, qty) {
	frappe.call({
    	'method': 'senstech.scripts.item_tools.nachbestellung',
    	'args': {
    		'item': frm.doc.name,
			'supplier': supplier,
			'qty': qty,
			'taxes': 'Vorsteuerfrei - ST'
    	},
		'callback': function(response) {
			frappe.set_route('Form', 'Purchase Order', response.message);
		}
    });
}

function lageretikett(item_doc) {
	frappe.call({
    	'method': 'senstech.scripts.tools.direct_print_doc',
    	'args': {
			'doctype': 'Item',
    		'name': item_doc.name,
			'print_format': 'Item Label ST',
			'printer_name': 'Zebra 57x32'
    	},
		'callback': function(response) {
		}
    });
}

function set_item_code_for_asset_category(frm) {
	if(frm.doc.asset_category) {
		frm.doc.set_value('item_name', frm.doc.asset_category);
		frappe.db.get_value("Asset Category Account", { 'parent': frm.doc.asset_category }, "fixed_asset_account", null, 'Asset Category').then(r => {
			if(r.message && r.message.fixed_asset_account) {
				frm.doc.set_value('item_code', 'IN-'+r.message.fixed_asset_account.substr(0,4));
			}
		});
	}
}

// Kunden- und Projektangabe im Artikelcode validieren
function validate_customer_and_project(frm) {
	let ic_customer = 'CU-00'+frm.doc.item_code.substr(3,3);
	let ic_project = 'EP-'+frm.doc.item_code.substr(3,6);
	if(frm.doc.project != ic_project) {
		validation_error(frm, 'project', __("Bei Artikeln dieser Artikelgruppe muss ein Entwicklungsprojekt zugewiesen sein"));
	}
	else if(!ic_customer.startsWith('CU-0001')) {
		// Bei Artikel-Kundencode < 100 das Feld "Kunde" nicht validieren, damit Eigenprodukte optional einen Kunden und eine Kunden-ArtNr haben können (= IST SAP-Nr.)
		if(!frm.doc.kunde) {
			validation_error(frm, 'kunde', __("Bei Artikeln dieser Artikelgruppe muss ein Kunde zugewiesen sein"));
		} else if(frm.doc.kunde != ic_customer) {
			validation_error(frm, 'item_code', __("Die Kundennummer im Artikelcode muss dem zugewiesenen Kunden entsprechen"));
		}
	}
}

// Artikelcode-Präfix aus Artikelgruppe erzeugen
function item_code_prefix_from_group(item_group) {
	const ic_prefixes = {'Halbfabrikate': 'HF', 'Sensorsubstrate poliert': 'PS', 'Sensorsubstrate isoliert': 'IS', 'Wiederkehrende Lohnfertigung (PZ-2002)': 'LF'};
	return ic_prefixes[item_group];
}

// Artikeltyp (für UI-Titel) aus Artikelgruppe erzeugen
function item_type_from_group(item_group) {
	const item_types = {'Halbfabrikate': 'Halbfabrikat', 'Sensorsubstrate poliert': 'Poliertes Sensorsubstrat', 'Sensorsubstrate isoliert': 'Isoliertes Sensorsubstrat', 'Wiederkehrende Lohnfertigung (PZ-2002)': 'Lohnfertigungsartikel'};
	return item_types[item_group];
}

// ggf. schon verwendeten Bergnamen zur gewählten Kunden-/Projektnr. finden und zuweisen
function find_and_set_mountain(frm, cust_proj) {
	frappe.db.get_list("Senstech Berg", {filters: {project: ['=','EP-'+cust_proj]}, limit: 1, as_list: true}).then(f => {
		if(f.length > 0) {
			frm.set_value('mountain_name', f[0][0]);
		}
		else {
			frappe.db.get_list("Item", {fields: ['mountain_name'], filters: {item_code: ['LIKE','__-'+cust_proj+'%']}, limit: 1, as_list: true}).then(g => {
				if(g.length > 0) {
					frm.set_value('mountain_name',g[0][0]);
				}
			});
		}
	});
}


// Feldweise Bearbeitungssperre bei Gate 3
function gate3_lock_item(frm) {
	let locked_fields = ['item_code', 'mountain_name', 'item_name', 'item_group', 'stock_uom', 'zeichnung', 'has_sub_batches', 'verpackungseinheit', 'has_variants', 'attributes', 'project', 'kunde'];
	// Ausdrücklich nicht gesperrt: bemerkung_intern, disabled, image, description, end_of_life, weight_per_unit, weight_uom, purchase_uom, lead_time_days, default_batch_size, mfg_duration, reject_percentage, sales_uom, versandvorlaufzeit, artikelcode_kunde, produktrevision_kunde,
	// qualitaetsspezifikation, single_label_print_format, flag_label_print_format, histogramme, text_histogramm, default
	locked_fields.forEach(field => {
		frm.set_df_property(field, 'read_only', true);
	});
	// manufactured_from nur sperren wenn Wert gesetzt
	if(frm.doc.manufactured_from) {
		frm.set_df_property('manufactured_from', 'read_only', true);
	}
}


// Zusätzliche Nullserie beantragen
function extra_pilot_series(frm, is_review) {
	
	frappe.db.count("Batch", {
		filters: {
			batch_type: 'Nullserie',
			item: frm.docname,
		}
	}).then(pilot_batch_count => {
		let dialog_title = is_review ? 'Antrag auf zusätzliche Nullserie bearbeiten' : 'Zusätzliche Nullserie beantragen';
		let proceed_label = is_review ? 'Speichern' : 'Antrag stellen';
		let cancel_label = 'Abbrechen';
		let extra_pilot_dialog = new frappe.ui.Dialog({
			'title': __(dialog_title),
			'fields': [
				{
					label: __('Max. Anzahl Nullserie-Chargen (neu)'),
					fieldname: 'max_pilot_batches',
					fieldtype: 'Int',
					default: frm.doc.gate2_max_pilot_batches + 1,
					read_only: true
				},
				{
					label: __('Davon bereits bestehend'),
					fieldname: 'pilot_batch_count',
					fieldtype: 'Data',
					default: pilot_batch_count,
					read_only: true
				},
				{
					label: __('Zusätzliche Nullserie beantragt am'),
					fieldname: 'extra_pilot_requested_date',
					fieldtype: 'Date',
					default: is_review ? frm.doc.extra_pilot_requested_date : 'Today',
					read_only: true
				},
				{
					label: __('Zusätzliche Nullserie beantragt von'),
					fieldname: 'extra_pilot_requested_by_name',
					fieldtype: 'Data',
					default: is_review ? frm.doc.extra_pilot_requested_by_name : frappe.session.user_fullname,
					read_only: true
				},
				{
					label: __('Antrag auf zusätzliche Nullserie bearbeitet von'),
					fieldname: 'extra_pilot_reviewed_by_name',
					fieldtype: 'Data',
					default: frappe.session.user_fullname,
					read_only: true,
					hidden: !is_review
				},
				{
					label: __('Entscheid'),
					fieldname: 'extra_pilot_granted',
					fieldtype: 'Select',
					options: ['','Antrag annehmen','Antrag ablehnen'],
					hidden: !is_review,
				}
			],
			'primary_action': function(){
				let val = extra_pilot_dialog.get_values();
				if(is_review && !val.extra_pilot_granted){
					frappe.msgprint(__("Bitte einen Entscheid zum Antrag treffen."), __("Angaben unvollständig"));
					return;
				}
				extra_pilot_dialog.hide();
				let action_string;
				
				if(is_review) {
					if(val.extra_pilot_granted == 'Antrag annehmen'){
						action_string = `Zusätzliche (${val.max_pilot_batches}.) Nullserie bewilligt durch`;
						frm.set_value('gate2_max_pilot_batches', val.max_pilot_batches);
					}
					else {
						action_string = 'Zusätzliche Nullserie abgelehnt durch';
					}
					frm.set_value('extra_pilot_requested_by_name', '');
					frm.set_value('extra_pilot_requested_date', '');
				} else {
					action_string = 'Zusätzliche Nullserie beantragt durch';
					frm.set_value('extra_pilot_requested_by_name', val.extra_pilot_requested_by_name);
					frm.set_value('extra_pilot_requested_date', val.extra_pilot_requested_date);
				}
				
				let gateN_log = frm.doc.gate2_clearance_log || '';
				gateN_log += "\n" + frappe.datetime.get_today() + ": " + action_string  + " " + frappe.session.user_fullname;
				frm.set_value('gate2_clearance_log', gateN_log);
				frm.save().then(r => {
					frm.reload_doc();
				});
			},
			'primary_action_label': proceed_label,
			'secondary_action_label': cancel_label
		});
		extra_pilot_dialog.show();
	});
}



// Indexerhöhung
function duplicate_increment_index(frm) {
	let prev_doc = frm.doc;
	let new_index = ("0"+(parseInt(prev_doc.item_code.substr(13,2))+1)).substr(-2, 2);
	let new_item_code = prev_doc.item_code.substr(0,13)+new_index+prev_doc.item_code.substr(15);
	frappe.db.exists("Item", new_item_code).then(already_exists => {
		if(already_exists) {
			frappe.msgprint(__("Der Artikel mit erhöhtem Index ({0}) ist bereits vorhanden.", [new_item_code]), __("Artikel existiert bereits"));
			return;
		}
		frm.copy_doc(function(new_doc) {
			new_doc.item_code = new_item_code;
			new_doc.prev_revision_clearance_status = prev_doc.gate_clearance_status;
			let aftersave_callback = function(r) {};
			
			if(new_doc.prev_revision_clearance_status >= 2) {
				// Artikel hat Gate-2-Freigabe => Felder teilw. kopieren
				let gate2_copy_fields = ['gate2_check_spec', 'gate2_upload_spec', 'gate2_check_fmea', 'gate2_upload_fmea', 'gate2_check_prototypes', 'gate2_link_prototypes', 'gate2_check_packaging', 'gate2_check_test_equipment', 'gate2_check_wek_instructions'];
				gate2_copy_fields.forEach(function(field_name) {
					new_doc[field_name] = prev_doc[field_name];
					//frm.set_value(field_name, prev_doc[field_name]);
				});
				new_doc.gate2_max_pilot_batches = 1;

				// Nach dem Speichern noch die Attachments zu Gate2 übernehmen
				aftersave_callback = function(r) {
					if(!r.exc) {
						let attach_fields = ['gate2_upload_spec', 'gate2_upload_fmea'];
						let attach_done = [];
						attach_fields.forEach(function(field_name) {
							let p = new Promise((resolve,reject) => {
								frappe.call({
									"method": "senstech.scripts.tools.attach_file_to_document",
									"args": {
										"file_url": frm.doc[field_name],
										"doctype": frm.doc.doctype,
										"docname": frm.doc.name, /* Achtung, new_doc hier im Callback nicht mehr verwenden */
										"field": field_name
									},
									"callback": function(response) {
										if(!response) {
											frappe.show_alert({message: __("Fehler beim Anhängen der Datei an das Dokument: {0}", [frm.doc[field_name]]), indicator: 'red'}, 10);
										}
										resolve();
									}
								});
							});
							attach_done.push(p);
						});

						// Alle Attachments übernommen: Dokument neu laden
						Promise.all(attach_done).then(f => {
							frappe.show_alert({message: __("Für ein beschleunigtes Gate-2-Review wurden einige Angaben von der vorherigen Artikelrevision übernommen"), indicator: 'green'}, 20);
							frm.reload_doc();
						});
					}
				}
			}
			frm.save('Save', aftersave_callback);
		}, false);
	});
}