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
	},
	
	refresh(frm) {
	    frm.set_df_property('primary_address_and_contact_detail','hidden','1');
	},

	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
	},
	
	after_save(frm) {
        var bezeichnung = cur_frm.doc.customer_name + " (" + cur_frm.doc.name + ")";
        if(cur_frm.doc.bezeichnung != bezeichnung) {
            cur_frm.set_value('bezeichnung', bezeichnung);
            cur_frm.save();
		}
	}
});