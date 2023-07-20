frappe.ui.form.on('Contact', {
    
	before_load(frm) {
	    if(cur_frm.doc.__islocal) {
    		if(cur_frm.doc.funktion == "-Kontakt vom System angelegt-") {
    		    cur_frm.doc.funktion = "Unbekannt";
    		}
    		//check_dynamic_link();
	    }
        add_child_lines();   
	},
	
	funktion(frm) {
	    var fkt = cur_frm.doc.funktion;
	    if (fkt == 'Allgemeine Nummer/Mailadresse') {
	        cur_frm.set_value('first_name','Allgemein');
	        cur_frm.set_value('last_name','');
	        cur_frm.set_value('salutation','');
	    }
	},
	
	validate(frm) {
	    if (cur_frm.doc.__islocal && cur_frm.doc.funktion == 'Unbekannt' && !cur_frm.doc.first_name && !cur_frm.doc.last_name && !cur_frm.doc.salutation) {
	        if (cur_frm.doc.phone_nos[0].phone || cur_frm.doc.email_ids[0].email_id) {
    	        // Lazy-Option um allgemeine Nummer und/oder E-Mail zu setzen (alles leer lassen)
    	        cur_frm.set_value('first_name','Allgemein');
    	        cur_frm.set_value('funktion','Allgemeine Nummer/Mailadresse');
	        }
	    }
	    
	    var fkt = cur_frm.doc.funktion;
	    cur_frm.set_value('designation', fkt);
	    if (fkt != 'Allgemeine Nummer/Mailadresse' && fkt != '-Kontakt vom System angelegt-' && fkt != 'E-Mail-Rechnungsempfänger') {
    	    if(! validation_require(frm, 'last_name', __('Nachname muss angegeben werden. Für allgemeinen Kontakt bitte "Allgemeine Nummer/Mailadresse" als Funktion auswählen.'))) {
    	        return;
    	    }
    	    if(! validation_require(frm, 'salutation', __("Anrede muss ausgewählt werden"))){
    	        return;
    	    }
	    }
	    if (fkt == 'Allgemeine Nummer/Mailadresse' || fkt == 'E-Mail-Rechnungsempfänger') {
	        if (!['Customer','Supplier'].includes(cur_frm.doc.links[0].link_doctype) || !cur_frm.doc.links[0].link_name) {
    	        validation_error('links', __("Allgemeine Kontakte und Rechnungsempfänger müssen mit einem Kunden/Lieferanten verknüpft sein"));
    	        return;	            
	        }
	    }
	},
	
    before_save(frm) {
	    update_child_lines_set_primary(frm);
    },
	
	after_save(frm) {
	    add_child_lines();
	}
});

// Primäre E-Mail und Telefonnummern setzen, leere Child-Zeilen entfernen (erzeugt durch add_child_lines)
function update_child_lines_set_primary(frm) {
    var emails = cur_frm.doc.email_ids;
    var tels = cur_frm.doc.phone_nos;
    var links = cur_frm.doc.links;
	cur_frm.set_value('phone', '');
	cur_frm.set_value('mobile_no', '');
	if (emails) {
        if(emails.length == 1 && !emails[0].email_id) {
	        emails.pop(); // ggf. leeren Eintrag wieder löschen
	    }
		emails.forEach(function(entry) {
			if (entry.idx == 1) {
				entry.is_primary = 1;
				if (cur_frm.doc.funktion=="E-Mail-Rechnungsempfänger") {
				    cur_frm.set_value('first_name',entry.email_id);
				    cur_frm.set_value('last_name','');
				    cur_frm.set_value('salutation','');
				}
			} 
		});
	}
	if (tels) {
	    if(tels.length == 1 && !tels[0].phone) {
	        tels.pop(); // ggf. leeren Eintrag wieder löschen
	    }
		tels.forEach(function(entry) {
			if (entry.idx == 1) {
				if (!entry.is_primary_mobile_no) {
					entry.is_primary_phone = 1;
				} else {
					entry.is_primary_phone = 0;
				}
			} 
		});
    }
    if (links) {
        if(links.length == 1 && links[0].link_doctype == 'Customer' && !links[0].link_name) {
	        links.pop(); // ggf. leeren Eintrag wieder löschen
	    }
	    
        // Bug Workaround: Linktitel korrekt setzen
        var fix_doctypes = { Customer: 'customer_name', Supplier: 'supplier_name'};
        var links = cur_frm.doc.links;
        links.forEach(function(entry) {
            if(Object.keys(fix_doctypes).includes(entry.link_doctype) && entry.link_name != '') {
                frappe.db.get_doc(entry.link_doctype,entry.link_name).then(function(linkdoc) {
                    var titlefield = fix_doctypes[entry.link_doctype];
                    frappe.model.set_value(entry.doctype, entry.name, 'link_title', linkdoc[titlefield]);
                    console.log('Fixed link title: '+linkdoc[titlefield]);
                    
                    // TODO: Firma wird auf letzte Verknüpfung mit Kunde/Lieferant gesetzt
                    //       Evtl. validieren dass nur 1 solche Verknüpfung existiert!
                    cur_frm.set_value('firma',entry.link_title);
	                cur_frm.refresh_field('firma');
	                cur_frm.set_value('newsletter_language',linkdoc.language);
	                cur_frm.refresh_field('newsletter_language');
                });
            }
        });
    }
    cur_frm.refresh_field('email_ids');
    cur_frm.refresh_field('phone_nos');
    cur_frm.refresh_field('links');
}

// Automatisch leere Zeile bei E-Mail, Telefon und Verknüpfung (Kunde) erzeugen
function add_child_lines() {
    if (is_empty(cur_frm.doc.email_ids)) {
        cur_frm.add_child('email_ids');
        cur_frm.refresh_field('email_ids');
    }	    
    if (is_empty(cur_frm.doc.phone_nos)) {
        cur_frm.add_child('phone_nos');
        cur_frm.refresh_field('phone_nos');
    }
    if (is_empty(cur_frm.doc.links)) {
        var new_link = cur_frm.add_child('links');
        new_link.link_doctype = "Customer";
        cur_frm.refresh_field('links');
    }
}

function check_dynamic_link() {
    if(frappe.dynamic_link) {
	    if (frappe.route_history.length >= 1) {
	        var histA = frappe.route_history[0];
	        var histB = histA;
	        if (frappe.route_history.length >= 2) {
	            histB = frappe.route_history[1];
	        }
	        var link_type = frappe.dynamic_link.doctype;
	        var link_doc = frappe.dynamic_link.doc[frappe.dynamic_link.fieldname];
            if ((histA[0] != 'Form' || histA[1] != link_type || histA[2] != link_doc) &&
                (histB[0] != 'Form' || histB[1] != link_type || histB[2] != link_doc)) {
                console.log('Deleting stale dynamic link');
                delete frappe.dynamic_link;
            }
        } else {
            console.log('No history, deleting dynamic link');
	        delete frappe.dynamic_link;
	    }
	}
}

// Prüfen ob Array leer ist (notwendig weil ![] == false)
function is_empty(data) {
    return (!data || data.length == 0);
}