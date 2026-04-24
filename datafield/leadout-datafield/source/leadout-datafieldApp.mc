import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.WatchUi;

class leadout_datafieldApp extends Application.AppBase {

    hidden var mView as leadout_datafieldView?;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        Communications.makeWebRequest(
            "https://leadout.oliy.co.uk/programme/latest",
            null,
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onProgrammeFetched)
        );
    }

    function onStop(state as Dictionary?) as Void {
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        mView = new leadout_datafieldView();
        return [mView];
    }

    function onProgrammeFetched(responseCode as Number, data as Dictionary?) as Void {
        if (responseCode == 200 && data != null) {
            Application.Storage.setValue("programme", data);
            if (mView != null) {
                var view = mView as leadout_datafieldView;
                view.setProgramme(data);
            }
        } else {
            if (mView != null) {
                var view = mView as leadout_datafieldView;
                view.setFetchFailed();
            }
        }
    }

}

function getApp() as leadout_datafieldApp {
    return Application.getApp() as leadout_datafieldApp;
}
