document.addEventListener('DOMContentLoaded', function () {
  // get the cta button element
  var selectElementButton = document.getElementById('selectElement')

  // handle cta button click event
  // to be able to start inspection
  selectElementButton.addEventListener('click', function () {

    // send the message to start inspection
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {data: null})
    })

    // close the extension popup
    window.close()

  }, false)
}, false)
