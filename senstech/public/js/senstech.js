// Always open linked documents (links with arrow icon) in new tab
$(document).on('click','i.octicon-arrow-right',function(event){
	event.preventDefault();
	event.stopPropagation();
	window.open($(this).parent().attr('href'), '_blank');
});

// use Senstech Desktop instead of Frappe Desktop
$(document).on('click','#navbar-breadcrumbs a, a.navbar-home',function(event){
	var navURL = event.currentTarget.href;
	
	// Make the breadcrumb link point to Senstech Settings page if that was visited recently
	if(navURL.includes("modules") && !navURL.endsWith('modules/Senstech')) {
		event.currentTarget.href = '#modules/Senstech';
		var i;
		for(i=frappe.route_history.length-1; i>=0; i--) {
			if(frappe.route_history[i][0]=='modules'){
				if(frappe.route_history[i][1]=='Senstech'){
					break;
				} else if(frappe.route_history[i][1]=='Senstech Settings'){
					event.currentTarget.href = '#modules/Senstech Settings';
					break;
				}
			}
		}
	}
	
	// Make the home link always point to Senstech main page
	else if(navURL.endsWith("#")) {
		event.currentTarget.href = '#modules/Senstech';
	}
});


$(document).ready(function() {
	
	// Redirect to Senstech Desktop after login
	if(frappe._cur_route=="") {
		window.location.href = "#modules/Senstech";
	}
	
	// Fix e-mail attachment behavior:
	// - Uncheck "attach document print" in e-mail window for all doctypes
	// - If there is an attachment by the same name as the document, attach it to emails by default
	const modalObserver = new MutationObserver( () => {
		var split_route = frappe._cur_route.split('/');
		var doctype = split_route[1];
		
		if(split_route[0] == '#Form' && cur_frm && cur_frm.doc.name) {			

			// Check for attachment with name matching document
			var att_id = null;
			var doc_name = cur_frm.doc.name+".pdf";
			var doc_info = cur_frm.get_docinfo();
			if(doc_info.attachments) {
				doc_info.attachments.every( att => {
					if(att.file_name == doc_name) {
						att_id = att.name;
						return false;
					}
					return true;
				});
			}
			if (att_id) {
				// Attach matching file by default
				var selector = 'input[data-file-name="'+att_id+'"]';
				$(selector).prop('checked', true); // Check all matching checkboxes
			}

			// Unattach document print for documents without sensible print formats,
			// as well as for documents with existing PDF attachment
			if(att_id || ['Lead','Opportunity','Customer','Supplier','Contact','Address'].includes(doctype)) {
				$('input[data-fieldname="attach_document_print"]').each(function() {
					if($(this).prop('checked')) {
						$(this).click();
					}
				});
			}
			
			// BCC Outlook on all sent email
			$('input[data-fieldname="bcc"]').prop('value','erp_archiv@senstech.ch');
			
			// Warn when emailing a draft document
			$('.email-draft-warning').remove();
			var email_form_visible = $('input[data-fieldname="send_me_a_copy"]').is(':visible');
			if(email_form_visible && cur_frm.doc.docstatus == 0 && frappe.model.is_submittable(cur_frm.doc.doctype)) {
				$('h4.modal-title').after('<div class="email-draft-warning">Dies ist ein Entwurf - Bitte vor dem Versenden buchen!</div>');
			}
			
		}
	});

  // Observe direct children of body, which includes creation of the modal window
	modalObserver.observe(document.body, { childList: true });


	// Fix printing behavior:
	// - If the document is submitted (docstatus=1), skip print preview and open attached PDF directly
	//   (Note: cancelled docs, docstatus=2, do not have the printer icon at all)
	document.addEventListener('click',function(event) {
		var on_printer_icon = event.target.classList.contains('fa-print');
		var on_print_menutext = event.target.classList.contains('menu-item-label') && ['Drucken','Print'].includes(event.target.innerText);
		var on_print_menuitem = event.target.children.length > 0
												 && event.target.children[0].classList.contains('menu-item-label')
												 && ['Drucken','Print'].includes(event.target.children[0].innerText);

		if(on_printer_icon || on_print_menutext || on_print_menuitem) {
			print_pdf_directly(event);
			$('.fa-print').parent().off('click');
			$('.menu-item-label[data-label="Print"]').parent().off('click');
			$('.menu-item-label[data-label="Drucken"]').parent().off('click');
		}
		
		fix_email_draft();
		
	}, true);
	
});

// add links to senstech wiki
frappe.provide('frappe.help.help_links');

frappe.call({
	method: 'senstech.utils.get_help_links',
	callback: function(r) {
		if(r.message) {
			var links = r.message;
			for (var i = 0; i < links.length; i++) {
				frappe.help.help_links['List/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
				frappe.help.help_links['Form/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
				frappe.help.help_links['Tree/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
			}
		} 
	}
});


function print_pdf_directly(e) {
	if (cur_frm) {
		var att_url = null;

    // Submitted document: Find attached PDF
		if (cur_frm.doc.docstatus == 1) {
			var doc_name = cur_frm.doc.name+".pdf";
			var doc_info = cur_frm.get_docinfo();
			if(doc_info.attachments) {
				cur_frm.get_docinfo().attachments.every( att => {
					if(att.file_name == doc_name) {
						att_url = att.file_url;
						return false;
					}
					return true;
				});
			}
			
			// No attached PDF exists: Create one in background!
			if(!att_url) {
				frappe.call({
					"method": "senstech.utils.add_freeze_pdf_to_dt",
					"args": {
							"dt": cur_frm.doctype,
							"dn": cur_frm.docname,
							"printformat": cur_frm.meta.default_print_format,
							"language": (cur_frm.doc.language || "de")
					},
					"callback": function(response) {
							cur_frm.reload_doc();
					}
				});
			}
		}

		// Not submitted or no attachment found: Link to PDF generator
		if(!att_url) {
			att_url = frappe.urllib.get_full_url("/api/method/frappe.utils.print_format.download_pdf?"
				+ "doctype=" + encodeURIComponent(cur_frm.doc.doctype)
				+ "&name=" + encodeURIComponent(cur_frm.doc.name)
				+ "&format=" + encodeURIComponent(cur_frm.meta.default_print_format)
				+ "&no_letterhead=" + "0"
				+ (cur_frm.doc.language ? "&_lang=" + cur_frm.doc.language : "")
				/* + (me.lang_code ? "&_lang=" + me.lang_code : "") */
			);
		}
			
		var w =	window.open(att_url);
		if (!w) {
			frappe.msgprint(__("Please enable pop-ups")); return;
		}
	}
}

function fix_email_draft() {
	
	if(cur_frm && cur_frm.doc.name && cur_frm.doc.contact_display) {
		// Remove any draft document
		localStorage.removeItem(cur_frm.doc.doctype + cur_frm.doc.name);
		
		// Create sensible email draft
		var splitDisplay = cur_frm.doc.contact_display.split(" ");
		if(splitDisplay[0] == 'Herr') {
			cur_frm.doc.real_name = "Sehr geehrter Herr " + splitDisplay.splice(2).join(" ");
			
		} else if(splitDisplay[0] == 'Frau') {
			cur_frm.doc.real_name = "Sehr geehrte Frau " + splitDisplay.splice(2).join(" ");
		} else {
			cur_frm.doc.real_name = "Guten Tag"
		}
		
		var betterDraft = "Im Anhang finden Sie unser Dokument Nr. "+cur_frm.doc.name+".<br><br>";
		localStorage.setItem(cur_frm.doc.doctype + cur_frm.doc.name, betterDraft);
		frappe.last_edited_communication = {};

	}
}
