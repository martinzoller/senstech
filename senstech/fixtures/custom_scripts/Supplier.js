frappe.ui.form.on('Supplier', {
    onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
    },
	validate(frm) {
		var iban = (frm.doc.iban || '').replace(/\s+/g,'');		
		if(iban) {
			if(iban[0] == "C" && iban[1] == "H" && iban[4] == 3){
				validation_error(frm, 'iban', __("QR-IBAN bitte im entsprechenden Feld eingeben."));
			}
			else {
				validate_iban(frm, iban, false);
			}
		}
		
		if(frappe.validated) {
			var qr_iban = (frm.doc.esr_participation_number || '').replace(/\s+/g,'');
			if(qr_iban) {
				validate_iban(frm, qr_iban, true);
			}
		}
	},
	before_save(frm) {
		check_for_duns(frm);
	},
	after_save(frm) {
        var bezeichnung = frm.doc.supplier_name + " (" + frm.doc.name + ")";
        if(frm.doc.bezeichnung != bezeichnung) {
            frm.set_value('bezeichnung', bezeichnung);
            frm.save();
		}
	},
	supplier_name(frm) {
		check_for_duns(frm);
	},
	country(frm) {
		check_for_duns(frm);
	},
});

function validate_iban(frm, iban, is_qr_iban) {
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
							frm.set_value("bic", result.bankData.bic);
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

// Falls DUNS-Nr. leer ist und Firmenname/Land ausgefüllt sind, Abfrage bei d&b ausführen
function check_for_duns(frm){
	if(frm.doc.supplier_name && frm.doc.country && !frm.doc.duns) {
		let main_address = {};
		if(frm.doc.__onload) {
			let address_list = frm.doc.__onload.addr_list;
			main_address = address_list.filter(e => e.is_primary_address)[0] || address_list[0] || {};
		}
		frappe.call({
			method: 'senstech.scripts.tools.get_duns',
			args: {
				search_term: frm.doc.supplier_name,
				street: main_address.address_line1 || '',
				city: main_address.city || '',
				country: frm.doc.country,
			},
			callback: (r) => {
				if(r.message && r.message.primaryName) {
					let rec = r.message;
					let zipcode_city = rec.companyZipCode + ' ' + rec.companyRegion;
					if(['USA','England','Kanada','Irland'].includes(frm.doc.country)) {
						zipcode_city = rec.companyRegion + ' ' + rec.companyZipCode;
					}
					let popup_msg = __('DUNS-Eintrag gefunden:')+'<br><br><b>'+rec.duns+'</b><br>'+rec.primaryName+'<br>'+rec.companyAddress+'<br>'+zipcode_city;
					let popup_indicator = 'green';
					if(rec.primaryName == frm.doc.supplier_name) {
						frm.set_value('duns', rec.duns);
					}
					else {
						popup_msg += '<br><br>'+__('DUNS-Eintrag: Abweichender Firmenname')+' => <a onclick="cur_frm.set_value(\'duns\',\''+rec.duns+'\');cur_frm.set_value(\'supplier_name\',\''+rec.primaryName+'\')">'+__('Trotzdem übernehmen')+'</a>';
						popup_indicator = 'orange';
					}
					frappe.show_alert({message: popup_msg, indicator: popup_indicator}, 25);
				}
			}
		});
	}
}