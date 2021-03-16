// Always open linked documents (links with arrow icon) in new tab
$(document).on('click','i.octicon-arrow-right',function(event){
	event.preventDefault();
	event.stopPropagation();
	window.open($(this).parent().attr('href'), '_blank');
});

$(document).ready(function() {
	
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
			cur_frm.get_docinfo().attachments.every( att => {
				if(att.file_name == doc_name) {
					att_id = att.name;
					return false;
				}
				return true;
			});
			if (att_id) {
				// Attach matching file by default
				var selector = 'input[data-file-name="'+att_id+'"]';
				if(! $(selector).prop('checked')) {
					$(selector).click();
				}
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
			
			// Check "Send me a copy" by default
			$('input[data-fieldname="send_me_a_copy"]').each(function() {
					if(!$(this).prop('checked')) {
						$(this).click();
					}
			});
		}
	});

  // Observe direct children of body, which includes creation of the modal window
	modalObserver.observe(document.body, { childList: true });


	// Fix printing behavior:
	// - If the document is submitted (docstatus=1), skip print preview and open attached PDF directly
	//   (Note: cancelled docs, docstatus=2, do not have the printer icon at all)
	document.addEventListener('click',function(event) {
		var on_printer_icon = event.target.classList.contains('fa-print');
		var on_print_menutext = event.target.classList.contains('menu-item-label') && event.target.innerText == 'Drucken';
		var on_print_menuitem = event.target.children.length > 0
												 && event.target.children[0].classList.contains('menu-item-label')
												 && event.target.children[0].innerText == 'Drucken';
		if(on_printer_icon || on_print_menutext || on_print_menuitem) {
			print_pdf_directly(event);
			$('.fa-print').parent().off('click');
			$('.menu-item-label[data-label="Drucken"]').parent().off('click');
		}
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
			cur_frm.get_docinfo().attachments.every( att => {
				if(att.file_name == doc_name) {
					att_url = att.file_url;
					return false;
				}
				return true;
			});
		}

		// Not submitted or no attachment found: Link to PDF generator
		if(!att_url) {
			att_url = frappe.urllib.get_full_url("/api/method/frappe.utils.print_format.download_pdf?"
				+ "doctype=" + encodeURIComponent(cur_frm.doc.doctype)
				+ "&name=" + encodeURIComponent(cur_frm.doc.name)
				+ "&format=" + encodeURIComponent(cur_frm.meta.default_print_format)
				+ "&no_letterhead=" + "0"
				/* + (me.lang_code ? ("&_lang=" + me.lang_code) : "")) */
			);
		}
			
		var w =	window.open(att_url);
		if (!w) {
			frappe.msgprint(__("Please enable pop-ups")); return;
		}
	}
}