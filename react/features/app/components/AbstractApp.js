/* global APP */

import _ from 'lodash';
import PropTypes from 'prop-types';
import React, { Component, Fragment } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import { compose, createStore } from 'redux';
import Thunk from 'redux-thunk';

import { i18next } from '../../base/i18n';
import {
    MiddlewareRegistry,
    ReducerRegistry,
    StateListenerRegistry
} from '../../base/redux';
import { SoundCollection } from '../../base/sounds';
import { PersistenceRegistry } from '../../base/storage';
import { toURLString } from '../../base/util';
import { OverlayContainer } from '../../overlay';

import { appNavigate, appWillMount, appWillUnmount } from '../actions';

/**
 * The default URL to open if no other was specified to {@code AbstractApp} via
 * props.
 *
 * FIXME: This is not at the best place here. This should be either in the
 * base/settings feature or a default in base/config.
 */
const DEFAULT_URL = 'https://meet.jit.si';

/**
 * Base (abstract) class for main App component.
 *
 * @abstract
 */
export class AbstractApp extends Component {
    /**
     * {@code AbstractApp} component's property types.
     *
     * @static
     */
    static propTypes = {
        /**
         * The default URL {@code AbstractApp} is to open when not in any
         * conference/room.
         */
        defaultURL: PropTypes.string,

        // XXX Refer to the implementation of loadURLObject: in
        // ios/sdk/src/JitsiMeetView.m for further information.
        timestamp: PropTypes.any,

        /**
         * The URL, if any, with which the app was launched.
         */
        url: PropTypes.oneOfType([
            PropTypes.object,
            PropTypes.string
        ])
    };

    /**
     * Initializes a new {@code AbstractApp} instance.
     *
     * @param {Object} props - The read-only React {@code Component} props with
     * which the new instance is to be initialized.
     */
    constructor(props) {
        super(props);

        this.state = {

            /**
             * The state of the »possible« async initialization of the
             * {@code AbstractApp}.
             */
            appAsyncInitialized: false,

            /**
             * The Route rendered by this {@code AbstractApp}.
             *
             * @type {Route}
             */
            route: {},

            /**
             * The redux store used by this {@code AbstractApp}.
             *
             * @type {Store}
             */
            store: undefined
        };

        /**
         * Make the mobile {@code AbstractApp} wait until the
         * {@code AsyncStorage} implementation of {@code Storage} initializes
         * fully.
         *
         * @private
         * @see {@link #_initStorage}
         * @type {Promise}
         */
        this._init
            = this._initStorage()
                .catch(() => { /* AbstractApp should always initialize! */ })
                .then(() =>
                    this.setState({
                        store: this._createStore()
                    }));
    }

    /**
     * Initializes the app.
     *
     * @inheritdoc
     */
    componentWillMount() {
        this._init.then(() => {
            const { dispatch } = this.state.store;

            dispatch(appWillMount(this));

            // We set the initialized state here and not in the constructor to
            // make sure that {@code componentWillMount} gets invoked before the
            // app tries to render the actual app content.
            this.setState({
                appAsyncInitialized: true
            });

            // If a URL was explicitly specified to this React Component, then
            // open it; otherwise, use a default.
            this._openURL(toURLString(this.props.url) || this._getDefaultURL());
        });
    }

    /**
     * Notifies this mounted React {@code Component} that it will receive new
     * props. Makes sure that this {@code AbstractApp} has a redux store to use.
     *
     * @inheritdoc
     * @param {Object} nextProps - The read-only React {@code Component} props
     * that this instance will receive.
     * @returns {void}
     */
    componentWillReceiveProps(nextProps) {
        const { props } = this;

        this._init.then(() => {
            // Deal with URL changes.
            let { url } = nextProps;

            url = toURLString(url);
            if (toURLString(props.url) !== url

                    // XXX Refer to the implementation of loadURLObject: in
                    // ios/sdk/src/JitsiMeetView.m for further information.
                    || props.timestamp !== nextProps.timestamp) {
                this._openURL(url || this._getDefaultURL());
            }
        });
    }

    /**
     * De-initializes the app.
     *
     * @inheritdoc
     */
    componentWillUnmount() {
        this.state.store.dispatch(appWillUnmount(this));
    }

    /**
     * Gets a {@code Location} object from the window with information about the
     * current location of the document. Explicitly defined to allow extenders
     * to override because React Native does not usually have a location
     * property on its window unless debugging remotely in which case the
     * browser that is the remote debugger will provide a location property on
     * the window.
     *
     * @public
     * @returns {Location} A {@code Location} object with information about the
     * current location of the document.
     */
    getWindowLocation() {
        return undefined;
    }

    /**
     * Delays this {@code AbstractApp}'s startup until the {@code Storage}
     * implementation of {@code localStorage} initializes. While the
     * initialization is instantaneous on Web (with Web Storage API), it is
     * asynchronous on mobile/react-native.
     *
     * @private
     * @returns {Promise}
     */
    _initStorage() {
        const localStorageInitializing = window.localStorage._initializing;

        return (
            typeof localStorageInitializing === 'undefined'
                ? Promise.resolve()
                : localStorageInitializing);
    }

    /**
     * Implements React's {@link Component#render()}.
     *
     * @inheritdoc
     * @returns {ReactElement}
     */
    render() {
        const { appAsyncInitialized, route, store } = this.state;
        const { component } = route;

        if (appAsyncInitialized && component) {
            return (
                <I18nextProvider i18n = { i18next }>
                    <Provider store = { store }>
                        <Fragment>
                            { this._createElement(component) }
                            <SoundCollection />
                            <OverlayContainer />
                        </Fragment>
                    </Provider>
                </I18nextProvider>
            );
        }

        return null;
    }

    /**
     * Creates a {@link ReactElement} from the specified component, the
     * specified props and the props of this {@code AbstractApp} which are
     * suitable for propagation to the children of this {@code Component}.
     *
     * @param {Component} component - The component from which the
     * {@code ReactElement} is to be created.
     * @param {Object} props - The read-only React {@code Component} props with
     * which the {@code ReactElement} is to be initialized.
     * @returns {ReactElement}
     * @protected
     */
    _createElement(component, props) {
        /* eslint-disable no-unused-vars */

        const {
            // The following props were introduced to be consumed entirely by
            // AbstractApp:
            defaultURL,
            timestamp,
            url,

            // The remaining props, if any, are considered suitable for
            // propagation to the children of this Component.
            ...thisProps
        } = this.props;

        /* eslint-enable no-unused-vars */

        return React.createElement(component, {
            ...thisProps,
            ...props
        });
    }

    /**
     * Initializes a new redux store instance suitable for use by this
     * {@code AbstractApp}.
     *
     * @private
     * @returns {Store} - A new redux store instance suitable for use by this
     * {@code AbstractApp}.
     */
    _createStore() {
        // Create combined reducer from all reducers in ReducerRegistry.
        const reducer = ReducerRegistry.combineReducers();

        // Apply all registered middleware from the MiddlewareRegistry and
        // additional 3rd party middleware:
        // - Thunk - allows us to dispatch async actions easily. For more info
        // @see https://github.com/gaearon/redux-thunk.
        let middleware = MiddlewareRegistry.applyMiddleware(Thunk);

        // Try to enable Redux DevTools Chrome extension in order to make it
        // available for the purposes of facilitating development.
        let devToolsExtension;

        if (typeof window === 'object'
                && (devToolsExtension = window.devToolsExtension)) {
            middleware = compose(middleware, devToolsExtension());
        }

        const store
            = createStore(
                reducer,
                PersistenceRegistry.getPersistedState(),
                middleware);

        // StateListenerRegistry
        StateListenerRegistry.subscribe(store);

        // This is temporary workaround to be able to dispatch actions from
        // non-reactified parts of the code (conference.js for example).
        // Don't use in the react code!!!
        // FIXME: remove when the reactification is finished!
        if (typeof APP !== 'undefined') {
            APP.store = store;
        }

        return store;
    }

    /**
     * Gets the default URL to be opened when this {@code App} mounts.
     *
     * @protected
     * @returns {string} The default URL to be opened when this {@code App}
     * mounts.
     */
    _getDefaultURL() {
        // If the execution environment provides a Location abstraction, then
        // this App at already at that location but it must be made aware of the
        // fact.
        const windowLocation = this.getWindowLocation();

        if (windowLocation) {
            const href = windowLocation.toString();

            if (href) {
                return href;
            }
        }

        return (
            this.props.defaultURL
                || this.state.store.getState()['features/base/settings']
                    .serverURL
                || DEFAULT_URL);
    }

    /**
     * Navigates to a specific Route.
     *
     * @param {Route} route - The Route to which to navigate.
     * @returns {Promise}
     */
    _navigate(route) {
        if (_.isEqual(route, this.state.route)) {
            return Promise.resolve();
        }

        if (route.href) {
            // This navigation requires loading a new URL in the browser.
            window.location.href = route.href;

            return Promise.resolve();
        }

        // XXX React's setState is asynchronous which means that the value of
        // this.state.route above may not even be correct. If the check is
        // performed before setState completes, the app may not navigate to the
        // expected route. In order to mitigate the problem, _navigate was
        // changed to return a Promise.
        return new Promise(resolve => this.setState({ route }, resolve));
    }

    /**
     * Navigates this {@code AbstractApp} to (i.e. opens) a specific URL.
     *
     * @param {Object|string} url - The URL to navigate this {@code AbstractApp}
     * to (i.e. the URL to open).
     * @protected
     * @returns {void}
     */
    _openURL(url) {
        this.state.store.dispatch(appNavigate(toURLString(url)));
    }
}
