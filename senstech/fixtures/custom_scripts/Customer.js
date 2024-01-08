frappe.ui.form.on('Customer', {
	validate(frm) {
	    if (frm.doc.territory == 'Alle Regionen') {
	        validation_error(frm, 'territory', __("Bitte wählen Sie eine Region aus."));
	    }
		if (frm.doc.territory == 'Europa') {
	        validation_error(frm, 'territory', __("Bitte statt 'Europa' die Region 'Europa übrige' auswählen."));
	    }
	    if (!['de','en'].includes(frm.doc.language)) {
	        validation_error(frm, 'language', __("Bitte eine gültige Drucksprache wählen"));
	    }
		if(!frm.doc.eori_number) {
			frappe.db.get_value("Territory", frm.doc.territory, "parent_territory").then(r => {
				if(r.message && r.message.parent_territory == 'Europa') {
					frappe.show_alert({message: "Bitte vor dem Anlegen einer Rechnung für diesen Kunden die EORI-Nummer erfassen. Diese ist für Exporte in die EU zwingend erforderlich.", indicator: 'orange'}, 10);
				}
			});
		}
		else if(!frm.doc.eori_number.match(/^[A-Z]{2}[0-9]{4,15}$/)) {
			validation_error(frm, 'eori_number', __("Die EORI-Nummer muss aus einem ISO-Ländercode und einer Ziffernfolge bestehen."));
		}
	},
	
	customer_name(frm) {
		check_for_duns(frm);
	},
	
	territory(frm) {
	    // Sprache ggf. überschreiben (irgendwie scheint "de" vorgegeben zu werden)
        if (['Schweiz','Deutschland','Österreich','Liechtenstein'].includes(frm.doc.territory)) {
            frm.set_value('language','de');
        }
        else {
            frm.set_value('language','en');
        }
	    if (!frm.doc.taxes_and_charges) {
	        if (['Schweiz','Liechtenstein'].includes(frm.doc.territory)) {
	            frm.set_value('taxes_and_charges',"8.1% MWST (303)");
	        }
	        else {
	            frm.set_value('taxes_and_charges',"Export 0% MWST (220) - ST");
	        }	        
	    }
		check_for_duns(frm);
	},
	
	refresh(frm) {
	    frm.set_df_property('primary_address_and_contact_detail','hidden','1');
	},

	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
	},
	
	before_save(frm) {
		check_for_duns(frm);
	},
	
	after_save(frm) {
        var bezeichnung = frm.doc.customer_name + " (" + frm.doc.name + ")";
        if(frm.doc.bezeichnung != bezeichnung) {
            frm.set_value('bezeichnung', bezeichnung);
            frm.save();
		}
	}
});


// Falls DUNS-Nr. leer, Firma/Region ausgefüllt und die Region ein definiertes Land ist, Abfrage bei d&b ausführen
function check_for_duns(frm){
	let terricountry = frm.doc.territory;
	if(frm.doc.customer_name && terricountry && !frm.doc.duns) {
		frappe.db.exists("Country", terricountry).then(is_country => {
			if(is_country) {
				let address_list = frm.doc.__onload.addr_list;
				let main_address = address_list.filter(e => e.is_primary_address)[0] || address_list[0] || {};
				frappe.call({
					method: 'senstech.scripts.tools.get_duns',
					args: {
						search_term: frm.doc.customer_name,
						street: main_address.address_line1 || '',
						city: main_address.city || '',
						country: terricountry,
					},
					callback: (r) => {
						if(r.message && r.message.primaryName) {
							let rec = r.message;
							let zipcode_city = rec.companyZipCode + ' ' + rec.companyRegion;
							if(['USA','England','Kanada','Irland'].includes(terricountry)) {
								zipcode_city = rec.companyRegion + ' ' + rec.companyZipCode;
							}
							let popup_msg = __('DUNS-Eintrag gefunden:')+'<br><br><b>'+rec.duns+'</b><br>'+rec.primaryName+'<br>'+rec.companyAddress+'<br>'+zipcode_city;
							let popup_indicator = 'green';
							if(rec.primaryName == frm.doc.customer_name) {
								frm.set_value('duns', rec.duns);
							}
							else {
								popup_msg += '<br><br>'+__('DUNS-Eintrag: Abweichender Firmenname')+' => <a onclick="cur_frm.set_value(\'duns\',\''+rec.duns+'\');cur_frm.set_value(\'customer_name\',\''+rec.primaryName+'\')">'+__('Trotzdem übernehmen')+'</a>';
								popup_indicator = 'orange';
							}
							frappe.show_alert({message: popup_msg, indicator: popup_indicator}, 25);
						}
					}
				});
			}
		});
	}
}