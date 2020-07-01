console.log( "=== simpread contentscripts load ===" )

import './assets/css/simpread.css';
import './assets/css/setting.css';
import 'notify_css';

import Velocity       from 'velocity';
import Notify         from 'notify';

import {focus}        from 'focus';
import * as read      from 'read';
import * as setting   from 'setting';
import * as kbd       from 'keyboard';
import * as highlight from 'highlight';
import * as scheme    from 'urlscheme';

import * as util      from 'util';
import { storage, STORAGE_MODE as mode } from 'storage';
import * as msg       from 'message';
import {browser}      from 'browser';
import * as watch     from 'watch';

import PureRead       from 'puread';
import * as puplugin  from 'puplugin';

let pr,                           // pure read object
    is_blacklist = false,
    current_url  = location.href; // current page url ( when changed page changed )

$.fn.sreffect = $.fn.velocity == undefined ? $.fn.animate : $.fn.velocity; // hack code for firefox

/**
 * Sevice: storage Get data form chrome storage
 */
storage.Read( () => {
    console.log('storage.Read---',blacklist());
    
    if ( blacklist() ) {
        $( "style" ).map( ( idx, item ) => {
            if ( item.innerText.includes( "simpread"        ) || 
                 item.innerText.includes( "sr-opt-focus"    ) || 
                 item.innerText.includes( "sr-rd-theme"     ) || 
                 item.innerText.includes( "notify-gp"       ) || 
                 item.innerText.includes( "md-waves-effect" )
            ) {
                $(item).remove();
            }
        });
    } else {
        bindShortcuts();
        !isLazyload() && autoOpen();
    }
});

/**
 * Blacklist
 * 
 * @return {boolean} true: is blacklist; false: is't blacklist
 */
function blacklist() {
    is_blacklist = util.Blacklist( puplugin.Plugin( "minimatch" ), storage.option );
    console.log( "current site is blacklist", is_blacklist,storage)
    return is_blacklist;
}

/**
 * isLazyload verify
 * 
 * @return {boolen} true: lazyload; false: preload
 */

function isLazyload() {
    const isLazyload_ = util.Lazyload( puplugin.Plugin( "minimatch" ), storage.option )
    console.log(1,'isLazy--load',isLazyload_, storage);
    
    return isLazyload_;
}

/**
 * Listen runtime message, include: `focus` `read` `shortcuts` `tab_selected`
 */
browser.runtime.onMessage.addListener( function( request, sender, sendResponse ) {
    console.log( "contentscripts runtime Listener", request, sender );
    if ( is_blacklist ) return;
    switch ( request.type ) {
        case msg.MESSAGE_ACTION.location:
            sendResponse(location);
            break;
        case msg.MESSAGE_ACTION.focus_mode:
            if ( storage.option.br_exit ) focus.Exist( false ) ? focus.Exit() : focusMode();
            else focusMode();
            break;
        case msg.MESSAGE_ACTION.shortcuts:
            bindShortcuts();
            break;
        case msg.MESSAGE_ACTION.tab_selected:
            if ( isLazyload() ) {
                browser.runtime.sendMessage( msg.Add( msg.MESSAGE_ACTION.browser_action, { code: 0 , url: window.location.href } ));
            } else browserAction( request.value.is_update );
            break;
        case msg.MESSAGE_ACTION.read_mode:
        case msg.MESSAGE_ACTION.browser_click:
            browser.runtime.sendMessage(msg.Add( msg.MESSAGE_ACTION.sites_enabled, { location: window.location } ));
            
            watch.Verify( ( state, result ) => {
                console.log(1,'watch.Veri-fy--',state, result,storage.option.br_exit);
                
                if ( state ) {
                    console.log( "watch.Lock()", result );
                    new Notify().Render( "配置文件已更新，刷新当前页面后才能生效。", "刷新", ()=>window.location.reload() );
                } else {
                     if ( storage.option.br_exit ) {
                        setting.Exist()  && setting.Exit();
                        !setting.Exist() && read.Exist( false ) ? read.Exit() : readMode();
                     }
                     else readMode();
                }
            });
            break;
        case msg.MESSAGE_ACTION.pending_site:
            // 临时阅读 匹配模式
            new Notify().Render({ content: "是否提交，以便更好地适配此页面？", action: "是的", cancel: "取消", callback: type => {
                if ( type == "cancel" ) return;
                browser.runtime.sendMessage( msg.Add( msg.MESSAGE_ACTION.save_site, { url: location.href, site: storage.pr.current.site, uid: storage.user.uid, type: "failed" }));
            }});
            break;
        case msg.MESSAGE_ACTION.menu_whitelist:
        case msg.MESSAGE_ACTION.menu_exclusion:
        case msg.MESSAGE_ACTION.menu_blacklist:
        case msg.MESSAGE_ACTION.menu_lazyload:
        case msg.MESSAGE_ACTION.menu_unrdist:
            const menuSrv = ( type, url ) => {
                if ( type == msg.MESSAGE_ACTION.menu_whitelist ) {
                    storage.read.whitelist.push( url );
                    new Notify().Render( "已加入到白名单。" );
                } else if ( type == msg.MESSAGE_ACTION.menu_exclusion ) {
                    storage.read.exclusion.push( url );
                    new Notify().Render( "已加入到排除列表。" );
                } else if ( type == msg.MESSAGE_ACTION.menu_blacklist ) {
                    storage.option.blacklist.push( url );
                    new Notify().Render( "已加入到黑名单。" );
                } else if ( type == msg.MESSAGE_ACTION.menu_lazyload ) {
                    storage.option.lazyload.push( url );
                    new Notify().Render( "已加入到延迟加载。" );
                } else if ( type == msg.MESSAGE_ACTION.menu_unrdist ) {
                    storage.UnRead( "add", util.GetPageInfo(), success => {
                        success  && new Notify().Render( 0, "成功加入未读列表。" );
                        !success && new Notify().Render( 0, "已加入未读列表，请勿重新加入。" );
                    });
                }
                storage.Write( () => {
                    watch.SendMessage( "option", true );
                });
            };
            if ( storage.option.urlscheme && /whitelist|exclusion|blacklist|lazyload/ig.test( request.type )) {
                scheme.Render( request.type.replace( "menu_", "" ), storage.option.urlscheme, ( type, off, value ) => {
                    storage.option.urlscheme = off;
                    menuSrv( "menu_" + type, value );
                });
            } else menuSrv( request.type, request.value.url );
            break;
    }
});

/**
 * Keyboard event handler
 */
function bindShortcuts() {
    // kbd.Bind( [ storage.focus.shortcuts.toLowerCase() ], focusMode );
    kbd.Bind( [ storage.read.shortcuts.toLowerCase()  ], readMode  );
    kbd.ListenESC( combo => {
        console.log(111,combo);
        
        if ( combo == "esc" && storage.option.esc ) {
            setting.Exist()  && setting.Exit();
            !setting.Exist() && focus.Exist() && focus.Exit();
            !setting.Exist() && read.Exist()  && read.Exit();
        }
    });
}

/**
 * Focus mode
 */
function focusMode() {
    console.log( "=== simpread focus mode active ===" )

    if ( !entry( focus, read, "阅读", "聚焦" )) return;

    watch.Verify( ( state, result ) => {
        if ( state ) {
            console.log( "watch.Lock()", result );
            new Notify().Render( "配置文件已更新，刷新当前页面后才能生效。", "刷新", ()=>window.location.reload() );
        } else {
            getCurrent( mode.focus );
            if ( storage.current.site.name.startsWith( "txtread:" ) ) {
                new Notify().Render( "当前为 <a href='http://ksria.com/simpread/docs/#/TXT-阅读器' target='_blank'>TXT 阅读器模式</a>，并不能使用设定功能。" )
                return;
            }
            if ( pr.state == "temp" && pr.dom ) {
                focus.Render( $(pr.dom), storage.current.bgcolor );
            } else {
                focus.GetFocus( pr.Include(), storage.current.site.include ).done( result => {
                    storage.pr.state == "none" && pr.TempMode( mode.focus, result[0] );
                    focus.Render( result, storage.current.bgcolor );
                }).fail( () => {
                    new Notify().Render( 2, "当前并未获取任何正文，请重新选取。" );
                });
            }
        }
    });
}

/**
 * Read mode
 */
function readMode() {
    console.log( "=== simpread read mode active ===" )

    if ( !entry( read, focus, "聚焦", "阅读" )) return;
    console.log(1);
    
    watch.Verify( ( state, result ) => {
        
        console.log(2,'watch.Veri-fy--',state, result,storage);
        
        if ( state ) {
            console.log( "watch.Lock()", result );
            new Notify().Render( "配置文件已更新，刷新当前页面后才能生效。", "刷新", ()=>window.location.reload() );
        } else {
            console.log(1,'getCurren-t',mode.read, pr);
            
            getCurrent( mode.read );
            if ( storage.current.site.name != "" ) {
                read.Render();
            } else if ( pr.state == "temp" && pr.dom ) {
                read.Render();
            } else {
                new Notify().Render( "<a href='http://ksria.com/simpread/docs/#/词法分析引擎?id=智能感知' target='_blank' >智能感知</a> 正文失败，请移动鼠标，并通过 <a href='http://ksria.com/simpread/docs/#/手动框选' target='_blank' >手动框选</a> 的方式生成正文。" );
                read.Highlight().done( dom => {
                    const rerender = element => {
                        pr.TempMode( mode.read, dom );
                        read.Render();
                    };
                    storage.current.highlight ? 
                        highlight.Control( dom ).done( newDom => {
                            rerender( newDom );
                        }) : rerender( dom );
                });
            }
        }
    });
}

/**
 * Auto open read mode, include:
 * 
 * - http://xxxx?simpread_mode=read
 * - auto && location.href not include exclusion list
 * - location.href include white list
 */
function autoOpen() {
    getCurrent( mode.read );
    const suffix    = window.location.href.includes( "simpread_mode=read" ),
          auto      = storage.current.auto,
          minimatch = puplugin.Plugin( "minimatch" ),
          whitelist = util.Whitelist( minimatch, storage.current ),
          exclusion = util.Exclusion( minimatch, storage.current );

    const enabled = suffix || whitelist || ( auto && exclusion == false );

    console.log('autoOpen--', suffix, whitelist, auto, exclusion, storage, pr );

    if  ( enabled ) {
            
        switch ( storage.current.site.name ) {
            case "my.oschina.net":
            case "36kr.com":
            case "chiphell.com":
            case "question.zhihu.com":
                $( () => readMode() );
                break;
            case "post.juejin.im":
            case "entry.juejin.im":
                setTimeout( ()=>readMode(), 2500 );
                break;
            case "kancloud.cn":
            case "sspai.com":
                setTimeout( ()=>readMode(), 1000 );
                break;
            default:
                pr.state == "adapter" && readMode();
                pr.state == "temp"    && pr.current.site.html != "" && whitelist && readMode();
                break;
        }
    }
}

/**
 * Focus and Read mode entry
 * 
 * @param  {object}  current mode object
 * @param  {object}  other   mode object
 * @param  {array}   render str
 * @return {boolean} true:continue; false: return
 */
function entry( current, other, ...str ) {
    console.log('entry-other',other.Exist(false));
    console.log('entry-current', current.Exist(true));
    
    if ( other.Exist(false) ) {
        new Notify().Render( `请先退出${str[0]}模式，才能进入${str[1]}模式。` );
        return false;
    }
    if ( current.Exist(true) ) return false;
    return true;
}

/**
 * Get storage.current
 * 
 * @param {string} value is mode.focus or mode.read or undefined
 */
function getCurrent( mode ) {
    if ( mode && storage.VerifyCur( mode ) ) {
        ( !pr || !pr.Exist() ) && pRead();
        console.log( "current site object is 2", mode, pr )
        storage.Getcur( mode, pr.current.site );
    }
}

/**
 * Browser action
 * 
 * @param {boolean} when set icon is_update = true
 */
function browserAction( is_update ) {
    console.log('browserAction--', is_update,current_url != location.href, current_url, storage);
    if ( is_update && current_url != location.href ) {
        current_url = location.href;
        autoOpen();
    }
    
    browser.runtime.sendMessage( msg.Add( msg.MESSAGE_ACTION.browser_action, { code: storage.current.site.name == "" ? -1 : 0 , url: window.location.href } ));
}
/** 
 * Pure Read
*/
function pRead() {
    pr = new PureRead( storage.sites );
    pr.cleanup = storage.read.cleanup == undefined ? true  : storage.read.cleanup;
    pr.pure    = storage.read.pure    == undefined ? false : storage.read.pure;
    pr.AddPlugin( puplugin.Plugin() );
    pr.Getsites();
    storage.puread = pr;
    console.log( "current puread object is   ", JSON.parse(JSON.stringify(pr)),storage )
}