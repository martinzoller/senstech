frappe.ui.form.on('Customer', {
	validate(frm) {
	    if (cur_frm.doc.territory == 'Alle Regionen') {
	        frappe.msgprint(__("Bitte wählen Sie eine Region aus."), __("Validation"));
	        frappe.validated=false;
	    }
	    if (!['de','en'].includes(cur_frm.doc.language)) {
	        frappe.msgprint(__("Bitte eine gültige Drucksprache wählen"), __("Validation"));
	        frappe.validated=false;
	    }
	},
	
	territory(frm) {
	    // Sprache ggf. überschreiben (irgendwie scheint "de" vorgegeben zu werden)
        if (['Schweiz','Deutschland','Österreich','Liechtenstein'].includes(cur_frm.doc.territory)) {
            cur_frm.set_value('language','de');
        }
        else {
            cur_frm.set_value('language','en');
        }
	    if (!cur_frm.doc.taxes_and_charges) {
	        if (['Schweiz','Liechtenstein'].includes(cur_frm.doc.territory)) {
	            cur_frm.set_value('taxes_and_charges',"7.7% MWST (302)");
	        }
	        else {
	            cur_frm.set_value('taxes_and_charges',"Export 0% MWST (220) - ST");
	        }	        
	    }
	},
	
	refresh(frm) {
	    cur_frm.set_df_property('primary_address_and_contact_detail','hidden','1');
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