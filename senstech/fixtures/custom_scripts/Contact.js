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
	
	leadstatus(frm) {
	    var leadstatus = cur_frm.doc.leadstatus;
	    var kein_touchpoint = (!cur_frm.doc.kontaktieren_bis || !is_in_future(cur_frm.doc.kontaktieren_bis));
	    if (leadstatus == "-") {
	        cur_frm.set_value('leadbesitzer','');
	        cur_frm.set_value('kontaktieren_bis','');
	    }
	    else {
	        if (!cur_frm.doc.leadbesitzer) {
	            cur_frm.set_value('leadbesitzer',frappe.user.name);
	        }	        
	        if (leadstatus == "Lead (Kundenanfrage)" || leadstatus == "Chance (Projektdetails bekannt)") {
    	        if (kein_touchpoint) {
    	            cur_frm.set_value('kontaktieren_bis',frappe.datetime.add_days(frappe.datetime.now_date(),30));
    	        }
    	    }
    	    else if (leadstatus == "Offerte unterbreitet" || leadstatus == "Qualitäts-/Optimierungsdiskussion") {
    	        if (kein_touchpoint) {
    	            cur_frm.set_value('kontaktieren_bis',frappe.datetime.add_days(frappe.datetime.now_date(),7));
    	        }	        
    	    }
    	    else {
    	        // Bestellt...., Verloren, Abgeschlossen
    	        cur_frm.set_value('kontaktieren_bis','');
    	    }
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
    	    if (!cur_frm.doc.last_name) {
    	        frappe.msgprint(__('Nachname muss angegeben werden. Für allgemeinen Kontakt bitte "Allgemeine Nummer/Mailadresse" als Funktion auswählen.'), __("Validation"));
    	        frappe.validated=false;
    	        return;
    	    }
    	    if (!cur_frm.doc.salutation) {
    	        frappe.msgprint(__("Anrede muss ausgewählt werden"), __("Validation"));
    	        frappe.validated=false;
    	        return;
    	    }
	    }
	    if (fkt == 'Allgemeine Nummer/Mailadresse' || fkt == 'E-Mail-Rechnungsempfänger') {
	        if (!['Customer','Supplier'].includes(cur_frm.doc.links[0].link_doctype) || !cur_frm.doc.links[0].link_name) {
    	        frappe.msgprint(__("Allgemeine Kontakte und Rechnungsempfänger müssen mit einem Kunden/Lieferanten verknüpft sein"), __("Validation"));
    	        frappe.validated=false;
    	        return;	            
	        }
	    }
	    if (cur_frm.doc.leadstatus && cur_frm.doc.leadstatus != '-'){
	        if (!cur_frm.doc.leadbesitzer) {
    	        frappe.msgprint(__("Kontakte mit Leadstatus müssen einen Besitzer haben"), __("Validation"));
    	        frappe.validated=false;
    	        return;
    	    }
    	    var status_mit_touchpoint = ["Lead (Kundenanfrage)",
	                                     "Chance (Projektdetails bekannt)",
	                                     "Offerte unterbreitet",
	                                     "Qualitäts-/Optimierungsdiskussion"];
	        if (status_mit_touchpoint.includes(cur_frm.doc.leadstatus)) {
	            if (!cur_frm.doc.kontaktieren_bis || !is_in_future(cur_frm.doc.kontaktieren_bis)) {
    	            frappe.msgprint(__("Bei Leads mit diesem Status muss ein Termin für den nächsten Kontakt definiert werden, welcher in der Zukunft liegt"), __("Validation"));
    	            frappe.validated=false;
    	            return;
	            }
	        }
	    }
	},
	
    before_save(frm) {

    	
	    update_child_lines_set_primary(frm);
    },
	
	after_save(frm) {
	    add_child_lines();
	    update_linked_todo();
	    update_linked_event();
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

function is_in_future(date_str) {
    var today = new frappe.datetime.datetime(frappe.datetime.now_date());
    var date = new frappe.datetime.datetime(date_str);
    
    // Heutiges Datum soll auch als "in Zukunft" akzeptiert werden
    return (frappe.datetime.compare(today, date) >= 0);
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

/* Wenn Lead nicht dem aktuellen Benutzer gehört, wird eine Aufgabe (To Do) für den Leadbesitzer erstellt */
function update_linked_todo() {
    var todo_description = cur_frm.doc.first_name+" "+cur_frm.doc.last_name+" kontaktieren";
    frappe.db.get_list(
        'ToDo', {
            fields: ['name'],
            filters: { reference_name: cur_frm.doc.name, reference_type: 'Contact', description: todo_description }
        }
    ).then( todos => {
        todos.forEach( todo => {
            console.log('Deleting todo '+todo.name);
            frappe.db.delete_doc('ToDo', todo.name);
        });
        if(cur_frm.doc.kontaktieren_bis && cur_frm.doc.leadbesitzer && cur_frm.doc.leadbesitzer != frappe.user.name) {
            var newToDo = {
                doctype: 'ToDo',
                owner: cur_frm.doc.leadbesitzer,
                description: todo_description,
                reference_name: cur_frm.doc.name,
                reference_type: 'Contact',
                date: cur_frm.doc.kontaktieren_bis
            }
            frappe.db.insert(newToDo).then( todo_doc => {
                console.log('ToDo created: '+todo_doc.name);
	            frappe.show_alert({message: "Aufgabe für "+cur_frm.doc.leadbesitzer+" angelegt", indicator: 'green'}, 5);
            });
        }
    });
}

/* Wenn Lead dem aktuellen Benutzer gehört, wird ein Kalendereintrag für den Leadbesitzer erstellt */
function update_linked_event() {
    var event_title = cur_frm.doc.first_name+" "+cur_frm.doc.last_name+" kontaktieren";
    var event_description = build_event_description();
    frappe.db.get_list(
        'Event', {
            fields: ['name'],
            filters: {
                reference_docname: cur_frm.doc.name,
                reference_doctype: 'Contact',
                subject: event_title,
                owner: frappe.user.name
            }
        }
    ).then( events => {
        events.forEach( event => {
            console.log('Deleting event '+event.name);
            frappe.db.delete_doc('Event', event.name);
        });
        if(cur_frm.doc.kontaktieren_bis && cur_frm.doc.leadbesitzer == frappe.user.name) {
            var new_event = {
                doctype: 'Event',
                owner: cur_frm.doc.leadbesitzer,
                subject: event_title,
                description: event_description,
                starts_on: cur_frm.doc.kontaktieren_bis + " 09:00:00",
                ends_on: cur_frm.doc.kontaktieren_bis + " 10:00:00",
            };
            frappe.db.exists("Google Calendar", "ERPNext - " + cur_frm.doc.leadbesitzer).then(has_gcal => {
                if(has_gcal) {
                    new_event.google_calendar = "ERPNext - " + cur_frm.doc.leadbesitzer;
                    new_event.sync_with_google_calendar = 1;
                }
                else {
                    new_event.sync_with_google_calendar = 0;               
                }
                frappe.db.insert(new_event).then(event_doc => {
                    console.log("Event created: "+event_doc.name);
                    var participant = {
                        parent: event_doc.name,
                        parentfield: 'event_participants',
                        parenttype: 'Event',
                        reference_docname: cur_frm.doc.name,
                        reference_doctype: 'Contact'
                    };
                    frappe.db.insert(participant).then(participant_doc => {
                        frappe.msgprint('');
                        frappe.hide_msgprint();
                        console.log("Participant created: "+participant_doc.name);
                        frappe.show_alert({message: "Termin für "+cur_frm.doc.leadbesitzer+" angelegt", indicator: 'green'}, 5);
                    });
                });
            });
        }
    });
}

function build_event_description() {
    var description = "Kontaktdaten "+ cur_frm.doc.first_name+' '+cur_frm.doc.last_name+":\n\n";
    var emails = cur_frm.doc.email_ids;
    var tels = cur_frm.doc.phone_nos;
    if (tels) {
        tels.forEach(function(entry) {
            if (entry.is_primary_mobile_no) {
                description += "Mobile: "+entry.phone+"\n";
            } else if(entry.is_primary_phone) {
                description += "Telefon: "+entry.phone+"\n";
            }
        });
    }
	if (emails) {
		emails.forEach(function(entry) {
			if (entry.is_primary) {
			    description += "E-Mail: "+entry.email_id+"\n";
			} 
		});
	}
	description += "\nERPNext-Kontakt: "+encodeURI("https://senstech.libracore.ch/desk#Form/Contact/"+cur_frm.doc.name)+"\n";
    return description;
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