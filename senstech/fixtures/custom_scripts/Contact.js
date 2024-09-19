frappe.ui.form.on('Contact', {
    
	before_load(frm) {
	    if(frm.doc.__islocal) {
    		if(frm.doc.funktion == "-Kontakt vom System angelegt-") {
    		    frm.doc.funktion = "Unbekannt";
    		}
    		//check_dynamic_link();
	    }
        add_child_lines(frm);
	},
	
	funktion(frm) {
	    var fkt = frm.doc.funktion;
	    if (fkt == 'Allgemeine Nummer/Mailadresse') {
	        frm.set_value('first_name','Allgemein');
	        frm.set_value('last_name','');
	        frm.set_value('salutation','');
	    }
	},
	
	validate(frm) {
	    if (frm.doc.__islocal && frm.doc.funktion == 'Unbekannt' && !frm.doc.first_name && !frm.doc.last_name && !frm.doc.salutation) {
	        if (frm.doc.phone_nos[0].phone || frm.doc.email_ids[0].email_id) {
    	        // Lazy-Option um allgemeine Nummer und/oder E-Mail zu setzen (alles leer lassen)
    	        frm.set_value('first_name','Allgemein');
    	        frm.set_value('funktion','Allgemeine Nummer/Mailadresse');
	        }
	    }
	    
	    var fkt = frm.doc.funktion;
	    frm.set_value('designation', fkt);
	    if (fkt != 'Allgemeine Nummer/Mailadresse' && fkt != '-Kontakt vom System angelegt-' && fkt != 'E-Mail-Rechnungsempfänger') {
    	    if(! validation_require(frm, 'last_name', __('Nachname muss angegeben werden. Für allgemeinen Kontakt bitte "Allgemeine Nummer/Mailadresse" als Funktion auswählen.'))) {
    	        return;
    	    }
    	    if(! validation_require(frm, 'salutation', __("Anrede muss ausgewählt werden"))){
    	        return;
    	    }
	    }
	    if (fkt == 'Allgemeine Nummer/Mailadresse' || fkt == 'E-Mail-Rechnungsempfänger') {
	        if (!['Customer','Supplier'].includes(frm.doc.links[0].link_doctype) || !frm.doc.links[0].link_name) {
    	        validation_error(frm, 'links', __("Allgemeine Kontakte und Rechnungsempfänger müssen mit einem Kunden/Lieferanten verknüpft sein"));
    	        return;	            
	        }
	    }
	},
	
    before_save(frm) {
	    update_child_lines_set_primary(frm);
    },
	
	after_save(frm) {
	    add_child_lines(frm);
	}
});

// Primäre E-Mail und Telefonnummern setzen, leere Child-Zeilen entfernen (erzeugt durch add_child_lines)
function update_child_lines_set_primary(frm) {
    var emails = frm.doc.email_ids;
    var tels = frm.doc.phone_nos;
    var links = frm.doc.links;
	frm.set_value('phone', '');
	frm.set_value('mobile_no', '');
	if (emails) {
        if(emails.length == 1 && !emails[0].email_id) {
	        emails.pop(); // ggf. leeren Eintrag wieder löschen
	    }
		emails.forEach(function(entry) {
			if (entry.idx == 1) {
				entry.is_primary = 1;
				if (frm.doc.funktion=="E-Mail-Rechnungsempfänger") {
				    frm.set_value('first_name',entry.email_id);
				    frm.set_value('last_name','');
				    frm.set_value('salutation','');
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
        var links = frm.doc.links;
        links.forEach(function(entry) {
            if(Object.keys(fix_doctypes).includes(entry.link_doctype) && entry.link_name != '') {
                frappe.db.get_doc(entry.link_doctype,entry.link_name).then(function(linkdoc) {
                    var titlefield = fix_doctypes[entry.link_doctype];
                    frappe.model.set_value(entry.doctype, entry.name, 'link_title', linkdoc[titlefield]);
                    console.log('Fixed link title: '+linkdoc[titlefield]);
                    
                    // TODO: Firma wird auf letzte Verknüpfung mit Kunde/Lieferant gesetzt
                    //       Evtl. validieren dass nur 1 solche Verknüpfung existiert!
                    frm.set_value('firma',entry.link_title);
	                frm.refresh_field('firma');
	                frm.set_value('newsletter_language',linkdoc.language);
	                frm.refresh_field('newsletter_language');
                });
            }
        });
    }
    frm.refresh_field('email_ids');
    frm.refresh_field('phone_nos');
    frm.refresh_field('links');
}

// Automatisch leere Zeile bei E-Mail, Telefon und Verknüpfung (Kunde) erzeugen
function add_child_lines(frm) {
    if (is_empty(frm.doc.email_ids)) {
        frm.add_child('email_ids');
        frm.refresh_field('email_ids');
    }	    
    if (is_empty(frm.doc.phone_nos)) {
        frm.add_child('phone_nos');
        frm.refresh_field('phone_nos');
    }
    if (is_empty(frm.doc.links)) {
        var new_link = frm.add_child('links');
        new_link.link_doctype = "Customer";
        frm.refresh_field('links');
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