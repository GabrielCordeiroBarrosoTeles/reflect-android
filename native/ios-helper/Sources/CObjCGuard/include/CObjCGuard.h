#ifndef REFLECT_COBJCGUARD_H
#define REFLECT_COBJCGUARD_H

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Runs `block` inside @try/@catch. Returns nil when it completed normally, or the caught
/// exception's description ("Name: reason") when it raised. Swift cannot catch Objective-C
/// exceptions, so every call into a private framework (CoreSimulator's ROCK proxies raise
/// on transport failures) goes through this. Swift callers use `ObjCGuard.run` instead.
NSString *_Nullable RSHTry(NS_NOESCAPE void (^block)(void));

NS_ASSUME_NONNULL_END

#endif /* REFLECT_COBJCGUARD_H */
