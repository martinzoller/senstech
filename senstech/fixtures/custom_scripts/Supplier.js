frappe.ui.form.on('Supplier', {
    onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
    },
	validate(frm) {
		var iban = (frm.doc.iban || '').replace(/\s+/g,'');		
		if(iban) {
			if(iban[0] == "C" && iban[1] == "H" && iban[4] == 3){
				frappe.msgprint(__("QR-IBAN bitte im entsprechenden Feld eingeben."), __("Ungültige IBAN"));
				frappe.validated = false;				
			}
			else {
				validate_iban(iban, false);
			}
		}
		
		if(frappe.validated) {
			var qr_iban = (frm.doc.esr_participation_number || '').replace(/\s+/g,'');
			validate_iban(qr_iban, true);
		}
	},	
	after_save(frm) {
        var bezeichnung = cur_frm.doc.supplier_name + " (" + cur_frm.doc.name + ")";
        if(cur_frm.doc.bezeichnung != bezeichnung) {
            cur_frm.set_value('bezeichnung', bezeichnung);
            cur_frm.save();
		}
	}
});

function validate_iban(iban, is_qr_iban) {
	var qr_dash = is_qr_iban ? 'QR-':'';
	$.ajax({
	url: 'https://openiban.com/validate/'+iban,
	data: { // pass additional options
		"validateBankCode": !is_qr_iban, 	// (not guaranteed)
		"getBIC": !is_qr_iban				// (not guaranteed)
	},
	success: function(data) {
		var result = data;	
		if(result.valid) {
			frappe.show_alert({message: __(qr_dash+"IBAN erfolgreich validiert"), indicator: 'green'}, 5);
			if(!is_qr_iban) {
				if(result.checkResults.bankCode) {
					if(frm.doc.bic != result.bankData.bic) {
						frm.doc.bic = result.bankData.bic
						frappe.show_alert({message: __("BIC automatisch aktualisiert"), indicator: 'green'}, 5);
					}
					else {
						frappe.show_alert({message: __("BIC ist korrekt"), indicator: 'green'}, 5);
					}
				}
				else {
					frappe.show_alert({message: __("Warnung: Bank-Code nicht erkannt"), indicator: 'red'}, 5);
				}
			}
		}
		else {
			frappe.validated = false;
			var translated_msgs = '';
			result.messages.forEach(f => {
				translated_msgs += __(f)+'<br>';
			});
			frappe.msgprint(translated_msgs, __("Fehler in "+qr_dash+"IBAN"));
		}
	},
	error: function(xhr) {
		frappe.show_alert({message: __(qr_dash+"IBAN konnte nicht validiert werden"), indicator: 'red'}, 5);
	}
});
}